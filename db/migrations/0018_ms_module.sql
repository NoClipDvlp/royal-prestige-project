-- ============================================================================
-- Royal Control — 0018_ms_module  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0027.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-0027]. Commit con [CORE-APPROVED: ADR-0027].
--
-- Módulo de correo masivo + ingesta (ms_*), TOTALMENTE AISLADO del motor v1 (ADR-0027).
-- AISLAMIENTO (línea dura): tablas con prefijo ms_, RLS propia, owner = distribuidor self. CERO ALTER a
-- tasks/task_instances/templates/KPI. CERO FK fuera de ms_* salvo owner_user_id → users (raíz de identidad)
-- y el flag en users. El único toque a tabla existente: la columna aditiva users.ms_mailing_enabled.
--
-- Doble candado de acceso (defensa en profundidad): RLS = propiedad (owner = auth.uid()) Y flag activo
-- (ms_enabled()). Flag OFF → 0 filas incluso por PostgREST directo ("la sección no responde", ADR §2).
-- El flag SOLO lo togglea un admin con sesión, o el sistema (trigger endurecido, patrón ADR-0022/0014).
-- Opt-out (ADR-0027 §3, opción del Orquestador): tabla ms_suppressions + token one-click por envío +
-- función pública DEFINER (sin service_role) para registrar la baja; emails suprimidos → 'skipped'.
-- ADR-0027 Act.2: (A) multi-plantilla por lote → el render final vive por-destinatario en ms_sends
-- (snapshot de ms_campaigns pasa a opcional); (B) programación → ms_campaigns.scheduled_at + status 'scheduled'.
-- ============================================================================

-- ── 0) Flag de acceso (ÚNICO toque a tabla existente; aditivo) ────────────────
alter table public.users add column ms_mailing_enabled boolean not null default false;

-- ── 1) Helpers (SECURITY DEFINER, search_path='' anti-injection; espejo de app_current_role) ──
-- ¿El usuario actual tiene el módulo habilitado? (gatea la RLS de ms_*). null/sin fila → false.
create or replace function public.ms_enabled()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select ms_mailing_enabled from public.users where id = (select auth.uid())), false) $$;
-- (ms_is_suppressed se define en §6, tras crear ms_suppressions: una función SQL valida sus relaciones al crearse.)

-- ── 2) Trigger: SOLO admin (o el sistema) cambia el flag (ADR-0027 §1 / patrón endurecido ADR-0022 §1) ──
-- Discrimina SISTEMA (service_role/trigger → auth.uid() null → permitido) de USUARIO (auth.uid() not null).
-- `is distinct from 'admin'` trata role=null como NO-admin → también bloquea al usuario sin rol (no confunde
-- "sistema" con "usuario sin rol"). Cierra la escalada: users_update permite self (policies.sql) y el
-- guardián del motor (0000) sólo cubre role/distribution → sin esto, el distribuidor se auto-habilitaría.
create or replace function public.forbid_ms_flag_self_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ms_mailing_enabled is distinct from old.ms_mailing_enabled then
    if (select auth.uid()) is not null
       and (select public.app_current_role()) is distinct from 'admin'::public.app_role then
      raise exception 'solo un admin puede cambiar ms_mailing_enabled';
    end if;
  end if;
  return new;
end $$;

create trigger trg_users_ms_flag
  before update on public.users
  for each row execute function public.forbid_ms_flag_self_change();

-- ── 3) Tablas ms_* ────────────────────────────────────────────────────────────
-- DATASETS: un import CSV guardado y reutilizable.
create table public.ms_datasets (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references public.users(id) on delete cascade,
  name            text not null,
  source_filename text,
  columns         jsonb not null default '{}'::jsonb,  -- {"fields":[...], "emailField":"Correo"}
  recipient_count int  not null default 0,             -- denormalizado para la lista (lo mantiene el action)
  deleted_at      timestamptz,                         -- soft-delete
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RECIPIENTS: filas del dataset (merge fields en jsonb). dedupe por email dentro del dataset.
create table public.ms_recipients (
  id            uuid primary key default gen_random_uuid(),
  dataset_id    uuid not null references public.ms_datasets(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,  -- denormalizado p/ RLS sin join
  email         text not null,
  fields        jsonb not null default '{}'::jsonb,    -- {"Nombre":"Ana","Apellido":"Pérez","Hora":"11am"}
  email_valid   boolean not null default true,
  created_at    timestamptz not null default now()
);

-- TEMPLATES: asunto + cuerpo con merge fields.
create table public.ms_templates (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name          text not null,
  subject       text not null,
  body_html     text not null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- CAMPAIGNS: un lote. template_id = plantilla POR DEFECTO (provenance). El render real vive por-destinatario
-- en ms_sends (multi-plantilla por lote, ADR-0027 Act.2-A) → el snapshot de lote es opcional (default/preview).
-- scheduled_at + status 'scheduled' = programación (Act.2-B); el disparo lo hace un cron no-core (Vercel Cron
-- → route que procesa lotes 'scheduled' vencidos) — sin pg_cron/pg_net, sin tocar más core.
create table public.ms_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references public.users(id) on delete cascade,
  template_id        uuid references public.ms_templates(id) on delete set null,  -- plantilla por defecto (provenance)
  dataset_id         uuid references public.ms_datasets(id)  on delete set null,
  subject_snapshot   text,  -- snapshot de lote OPCIONAL (el render final está por-destinatario en ms_sends)
  body_html_snapshot text,
  status             text not null default 'draft'
    check (status in ('draft','scheduled','sending','sent','partial','failed','canceled')),
  scheduled_at       timestamptz,  -- programación del lote (status 'scheduled'); disparo = cron no-core
  total_count        int not null default 0,
  sent_count         int not null default 0,
  failed_count       int not null default 0,
  started_at         timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- SENDS: libro mayor por destinatario (atomicidad/reanudación). Guarda el RENDER FINAL por destinatario
-- (subject/body snapshot) → soporta multi-plantilla por lote y deja el log/reenvío fiel. unsub_token = baja
-- one-click no-forjable.
create table public.ms_sends (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.ms_campaigns(id) on delete cascade,
  owner_user_id       uuid not null references public.users(id) on delete cascade,
  recipient_id        uuid references public.ms_recipients(id) on delete set null,  -- provenance null-safe
  email               text not null,
  subject_snapshot    text,  -- render FINAL por destinatario (null mientras pending/skipped)
  body_html_snapshot  text,
  status              text not null default 'pending'
    check (status in ('pending','sent','failed','skipped')),
  error               text,
  provider_message_id text,
  unsub_token         uuid not null default gen_random_uuid(),  -- token de baja (random v4 → inenumerable)
  attempt             int not null default 0,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- SUPPRESSIONS: lista de baja (opt-out) por dueño (v1 scope = owner; subdominio global = v2).
create table public.ms_suppressions (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  email         text not null,
  reason        text not null default 'unsubscribe',
  created_at    timestamptz not null default now()
);

-- ── 4) Índices + unicidad (dedupe / idempotencia / RLS-perf / lookups) ────────
create unique index uq_ms_recipients_dataset_email on public.ms_recipients (dataset_id, lower(email)); -- dedupe
create unique index uq_ms_sends_campaign_email on public.ms_sends (campaign_id, lower(email));   -- idempotencia
create unique index uq_ms_suppr_owner_email   on public.ms_suppressions (owner_user_id, lower(email));
create index idx_ms_sends_unsub_token on public.ms_sends (unsub_token);                          -- baja por token

create index idx_ms_datasets_owner    on public.ms_datasets (owner_user_id);
create index idx_ms_recipients_owner  on public.ms_recipients (owner_user_id);
create index idx_ms_recipients_dataset on public.ms_recipients (dataset_id);
create index idx_ms_templates_owner   on public.ms_templates (owner_user_id);
create index idx_ms_campaigns_owner   on public.ms_campaigns (owner_user_id);
create index idx_ms_sends_owner       on public.ms_sends (owner_user_id);
create index idx_ms_sends_campaign_status on public.ms_sends (campaign_id, status);              -- reanudación
create index idx_ms_suppr_owner       on public.ms_suppressions (owner_user_id);

-- ── 5) updated_at (reusa el helper de 0000) ───────────────────────────────────
create trigger trg_ms_datasets_updated  before update on public.ms_datasets  for each row execute function public.set_updated_at();
create trigger trg_ms_templates_updated before update on public.ms_templates for each row execute function public.set_updated_at();
create trigger trg_ms_campaigns_updated before update on public.ms_campaigns for each row execute function public.set_updated_at();
create trigger trg_ms_sends_updated     before update on public.ms_sends     for each row execute function public.set_updated_at();

-- ── 6) Funciones que leen ms_* (tras crear las tablas) ────────────────────────
-- ¿El email está suprimido para el dueño ACTUAL? (lo usa el envío para marcar 'skipped'). Scope = auth.uid()
-- dentro de la función → no permite sondear listas ajenas.
create or replace function public.ms_is_suppressed(p_email text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ms_suppressions
    where owner_user_id = (select auth.uid()) and lower(email) = lower(p_email)
  )
$$;

-- Función de baja pública (DEFINER, SIN service_role):
-- El endpoint público (no-core, sin sesión) recibe el token y llama aquí. DEFINER bypassa la RLS para
-- insertar la supresión; la AUTORIZACIÓN es el token (uuid v4 almacenado en ms_sends → no-forjable). No
-- revela si el token existía (no-op silencioso) → sin oráculo. Idempotente.
create or replace function public.ms_suppress_by_token(p_token uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  select owner_user_id, email into s from public.ms_sends where unsub_token = p_token limit 1;
  if not found then return; end if;  -- token inválido → no-op
  insert into public.ms_suppressions (owner_user_id, email, reason)
  values (s.owner_user_id, s.email, 'unsubscribe')
  on conflict (owner_user_id, lower(email)) do nothing;
end $$;

-- ── 7) RLS: ENABLE + FORCE en las 6 tablas (default-deny para todo lo demás) ───
do $$
declare t text;
begin
  foreach t in array array['ms_datasets','ms_recipients','ms_templates','ms_campaigns','ms_sends','ms_suppressions'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force  row level security;', t);
  end loop;
end $$;

-- Contenido del módulo: SELF + flag activo (doble candado), para TODOS los verbos. admin NO lee contenido
-- ms_* (gestiona el flag en users; ADR §1) → sin policy admin → default-deny para admin/auditor/jd/seller.
create policy ms_datasets_self   on public.ms_datasets   for all
  using (owner_user_id = (select auth.uid()) and public.ms_enabled())
  with check (owner_user_id = (select auth.uid()) and public.ms_enabled());
create policy ms_recipients_self on public.ms_recipients for all
  using (owner_user_id = (select auth.uid()) and public.ms_enabled())
  with check (owner_user_id = (select auth.uid()) and public.ms_enabled());
create policy ms_templates_self  on public.ms_templates  for all
  using (owner_user_id = (select auth.uid()) and public.ms_enabled())
  with check (owner_user_id = (select auth.uid()) and public.ms_enabled());
create policy ms_campaigns_self  on public.ms_campaigns  for all
  using (owner_user_id = (select auth.uid()) and public.ms_enabled())
  with check (owner_user_id = (select auth.uid()) and public.ms_enabled());
create policy ms_sends_self      on public.ms_sends      for all
  using (owner_user_id = (select auth.uid()) and public.ms_enabled())
  with check (owner_user_id = (select auth.uid()) and public.ms_enabled());

-- Supresiones: el dueño SOLO LEE su lista (UI read-only, ADR §3). La escritura va por ms_suppress_by_token
-- (DEFINER) o service_role → sin policy de insert/update/delete para authenticated (default-deny).
create policy ms_suppr_select_self on public.ms_suppressions for select
  using (owner_user_id = (select auth.uid()) and public.ms_enabled());

-- ── 8) GRANTs (la RLS gatea; anon sin acceso salvo la baja pública) ───────────
grant select, insert, update, delete on
  public.ms_datasets, public.ms_recipients, public.ms_templates, public.ms_campaigns, public.ms_sends to authenticated;
grant select on public.ms_suppressions to authenticated;
grant all on
  public.ms_datasets, public.ms_recipients, public.ms_templates, public.ms_campaigns, public.ms_sends, public.ms_suppressions
  to service_role;

revoke execute on function public.ms_enabled()            from public;
revoke execute on function public.ms_is_suppressed(text)  from public;
revoke execute on function public.ms_suppress_by_token(uuid) from public;
grant  execute on function public.ms_enabled()            to authenticated;
grant  execute on function public.ms_is_suppressed(text)  to authenticated;
-- la baja la dispara un endpoint público SIN sesión → anon; el token es la autorización.
grant  execute on function public.ms_suppress_by_token(uuid) to anon, authenticated;
