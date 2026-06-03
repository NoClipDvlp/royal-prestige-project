-- ============================================================================
-- Royal Control — SQL CONSOLIDADO DE DEPLOY (GENERADO — no editar a mano)
-- Fuente: migraciones + RLS del repo. Orden: 0000 → policies → 0001 → 0002 → 0003.
-- Aplicar en Supabase (SQL Editor o psql). Ver docs/DEPLOY.md para el contexto
-- (pg_cron, OAuth, confirmación de email, env, primer admin).
-- Helpers de RLS en public.app_current_role/app_current_distribution (ADR-0008).
-- ============================================================================

-- =====================================================================
-- >>> db/migrations/0000_init.sql
-- =====================================================================

-- ============================================================================
-- Royal Control — 0000_init  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/0000_*). Autorizado por ADR-0003.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX].
--
-- Schema del MVP fiel a docs/DATA_MODEL.md + decisiones de ADR-0003:
--   enums, tablas (FKs nullable post-MVP), CHECKs duros, owner_slot (tope 3 sin carrera),
--   desnormalización de task_instances + triggers (poblado + inmutabilidad),
--   snapshots append-only, helpers SECURITY DEFINER (search_path=''), índices §6, GRANTs.
-- La RLS vive en lib/rls-policies/policies.sql (también core). El seed en db/seed/roles.sql.
--
-- NOTA: la franja horaria 8–22 es una CONSTANTE de aplicación (ADR-0003); NO hay tabla settings.
-- NOTA: este script asume que existen `auth.users` y `auth.uid()` (los provee Supabase;
--       en los tests los provee db/tests/00_auth_shim.sql).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums (los 6, incl. post-MVP jd/seller desde día 1)
-- ----------------------------------------------------------------------------
create type app_role        as enum ('admin','auditor','distributor','jd','seller');
create type category_scope  as enum ('global','personal');
create type task_origin     as enum ('self','superior');
create type task_priority   as enum ('low','medium','high');
create type recurrence_type as enum ('once','daily','weekly','monthly');
create type snapshot_period as enum ('monthly','quarterly');

-- ----------------------------------------------------------------------------
-- Tablas
-- ----------------------------------------------------------------------------
create table distributions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo_url   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  email           text unique,
  phone           text,                       -- solo identificador (no auth)
  photo_url       text,
  role            app_role,                    -- null = sin rol → pantalla "contacta admin"
  distribution_id uuid references distributions(id),
  auth_providers  text[]  not null default '{}',
  preferences     jsonb   not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- CHECK rol↔distribución (ADR-0003 ratificado):
  --   distributor/jd/seller ⇒ distribution_id NOT NULL ; admin/auditor/null ⇒ NULL
  constraint chk_role_distribution check (
    case role
      when 'distributor' then distribution_id is not null
      when 'jd'          then distribution_id is not null
      when 'seller'      then distribution_id is not null
      when 'admin'       then distribution_id is null
      when 'auditor'     then distribution_id is null
      else distribution_id is null            -- role null (recién registrado)
    end
  )
);

create table distribution_owners (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references distributions(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  owner_slot      smallint not null check (owner_slot between 1 and 3),
  created_at      timestamptz not null default now(),
  unique (distribution_id, user_id),
  unique (distribution_id, owner_slot)         -- tope DURO de 3 owners, sin carrera
);

-- Jerarquía post-MVP: existe y con RLS activa, pero NO se puebla en MVP.
create table org_hierarchy (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  parent_user_id  uuid references users(id) on delete set null,
  distribution_id uuid not null references distributions(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create table task_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  color         text,
  scope         category_scope not null,
  owner_user_id uuid references users(id) on delete cascade,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  constraint chk_category_scope check (
    (scope = 'global'   and owner_user_id is null) or
    (scope = 'personal' and owner_user_id is not null)
  )
);

create table tasks (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references users(id) on delete cascade,
  assigned_by_user_id uuid references users(id) on delete set null,   -- null = self
  origin              task_origin not null default 'self',
  distribution_id     uuid not null references distributions(id) on delete cascade,
  title               text not null,
  category_id         uuid references task_categories(id) on delete set null,
  priority            task_priority not null default 'medium',
  recurrence          recurrence_type not null default 'once',
  start_date          date not null,
  time_slot           time,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Fuente de verdad del cumplimiento. distribution_id/owner_user_id DESNORMALIZADOS
-- (poblados por trigger desde tasks) para una RLS plana e indexable, sin join.
create table task_instances (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references tasks(id) on delete cascade,
  date            date not null,
  status_pct      smallint not null default 0 check (status_pct in (0,50,100)),
  completed_at    timestamptz,
  distribution_id uuid not null references distributions(id),  -- desnormalizado
  owner_user_id   uuid not null references users(id),          -- desnormalizado
  unique (task_id, date)                                       -- idempotencia del job
);

create table metric_snapshots (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  period         snapshot_period not null,
  period_start   date not null,
  period_end     date not null,
  compliance_pct numeric not null,
  tasks_done     int not null default 0,
  tasks_half     int not null default 0,
  tasks_undone   int not null default 0,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (user_id, period, period_start)        -- evita snapshots duplicados
);

create table calendar_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  google_calendar_id text not null,
  sync_direction     text not null default 'push_only',
  scopes             text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table calendar_sync_conflicts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  task_instance_id uuid not null references task_instances(id) on delete cascade,
  type             text not null,
  resolved         boolean not null default false,
  created_at       timestamptz not null default now()
);

create table notifications (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind    text not null,
  summary text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helpers de identidad para RLS (SECURITY DEFINER, search_path='' anti-injection).
-- Propietario = superuser (postgres en Supabase) → bypass-RLS → SIN recursión contra users.
-- ----------------------------------------------------------------------------
create or replace function public.app_current_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from public.users where id = (select auth.uid()) $$;

create or replace function public.app_current_distribution()
returns uuid
language sql stable security definer set search_path = ''
as $$ select distribution_id from public.users where id = (select auth.uid()) $$;

-- ----------------------------------------------------------------------------
-- Triggers de reglas duras
-- ----------------------------------------------------------------------------
-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_distributions_updated before update on distributions
  for each row execute function public.set_updated_at();
create trigger trg_users_updated before update on users
  for each row execute function public.set_updated_at();
create trigger trg_tasks_updated before update on tasks
  for each row execute function public.set_updated_at();

-- task_instances: poblar distribution_id/owner_user_id desde el task padre (ignora lo que mande el cliente)
create or replace function public.populate_task_instance_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select t.distribution_id, t.owner_user_id
    into new.distribution_id, new.owner_user_id
  from public.tasks t
  where t.id = new.task_id;
  if new.distribution_id is null then
    raise exception 'task % inexistente para la instancia', new.task_id;
  end if;
  return new;
end $$;
create trigger trg_ti_scope before insert on task_instances
  for each row execute function public.populate_task_instance_scope();

-- tasks: distribution_id y owner_user_id INMUTABLES (sostiene la desnormalización de instances)
create or replace function public.forbid_task_scope_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.distribution_id is distinct from old.distribution_id then
    raise exception 'tasks.distribution_id es inmutable';
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'tasks.owner_user_id es inmutable';
  end if;
  return new;
end $$;
create trigger trg_task_scope_immutable before update on tasks
  for each row execute function public.forbid_task_scope_change();

-- metric_snapshots: APPEND-ONLY (ni admin ni service_role recalculan). Invariante de DATA_MODEL #6.
create or replace function public.forbid_snapshot_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'metric_snapshots es append-only (sin UPDATE/DELETE)';
end $$;
create trigger trg_snapshot_no_update before update on metric_snapshots
  for each row execute function public.forbid_snapshot_mutation();
create trigger trg_snapshot_no_delete before delete on metric_snapshots
  for each row execute function public.forbid_snapshot_mutation();

-- users: NADIE salvo admin cambia su propio role/distribution_id (anti escalada de privilegios)
create or replace function public.forbid_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select public.app_current_role()) is distinct from 'admin'::public.app_role then
    if new.role is distinct from old.role
       or new.distribution_id is distinct from old.distribution_id then
      raise exception 'no puedes cambiar tu rol o tu distribución';
    end if;
  end if;
  return new;
end $$;
create trigger trg_users_no_priv_esc before update on users
  for each row execute function public.forbid_self_privilege_escalation();

-- ----------------------------------------------------------------------------
-- Índices (ADR §6) — RLS-perf + queries
-- ----------------------------------------------------------------------------
create index idx_users_distribution on users(distribution_id);
create index idx_users_role on users(role);
create index idx_tasks_distribution on tasks(distribution_id);
create index idx_tasks_owner on tasks(owner_user_id);
create index idx_tasks_start_date on tasks(start_date);
create index idx_tasks_category on tasks(category_id);
create index idx_ti_dist_date on task_instances(distribution_id, date);
create index idx_ti_owner_date on task_instances(owner_user_id, date);
create index idx_snap_user on metric_snapshots(user_id);
create index idx_snap_period on metric_snapshots(period, period_start);
create index idx_downers_distribution on distribution_owners(distribution_id);
create index idx_downers_user on distribution_owners(user_id);
create index idx_cat_scope on task_categories(scope);
create index idx_cat_owner on task_categories(owner_user_id);
create index idx_orgh_distribution on org_hierarchy(distribution_id);
create index idx_orgh_parent on org_hierarchy(parent_user_id);
create index idx_orgh_user on org_hierarchy(user_id);
create index idx_callinks_user on calendar_links(user_id);
create index idx_conflicts_user on calendar_sync_conflicts(user_id);
create index idx_notif_user on notifications(user_id);

-- ----------------------------------------------------------------------------
-- GRANTs base. La RLS (lib/rls-policies) filtra FILAS; los GRANTs filtran VERBOS.
-- authenticated = unión de verbos que algún app_role necesita (RLS hace el gating por rol).
-- service_role = ALL (jobs server-side; bypassa RLS). anon = sin acceso a negocio.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  distributions, users, distribution_owners, org_hierarchy,
  task_categories, tasks, task_instances, calendar_links
  to authenticated;

-- metric_snapshots: authenticated puede SELECT (auditor/distributor) e INSERT (admin); nunca U/D (append-only).
grant select, insert on metric_snapshots to authenticated;
-- conflictos y notificaciones: las crea el job (service_role); el cliente lee y marca (UPDATE).
grant select, update on calendar_sync_conflicts, notifications to authenticated;

grant all on all tables in schema public to service_role;

-- =====================================================================
-- >>> lib/rls-policies/policies.sql
-- =====================================================================

-- ============================================================================
-- Royal Control — RLS policies  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: lib/rls-policies/). Autorizado por ADR-0003.
-- Implementa la matriz rol×tabla×verbo del ADR-0003. Se aplica DESPUÉS de 0000_init.sql.
--
-- Principios (ADR-0003, no negociables):
--   • ENABLE + FORCE RLS en TODAS las tablas (incl. vacías post-MVP). service_role bypassa.
--   • Default-deny: sin policy que matchee → denegado. jd/seller sin policy → deny.
--   • Identidad vía helpers public.app_current_role() / public.app_current_distribution() (SECURITY DEFINER).
--   • TODA policy de negocio exige rol específico (admin/auditor/distributor). La ÚNICA
--     cosa que un usuario role=null puede leer es su propia fila en `users`.
--   • Anti-recursión: la self-policy de users usa `id = (select auth.uid())` directo.
-- ============================================================================

-- Activar + forzar RLS en todas las tablas de negocio
do $$
declare t text;
begin
  foreach t in array array[
    'distributions','users','distribution_owners','org_hierarchy','task_categories',
    'tasks','task_instances','metric_snapshots','calendar_links',
    'calendar_sync_conflicts','notifications'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force  row level security;', t);
  end loop;
end $$;

-- ============================ distributions ============================
create policy distributions_select on distributions for select using (
  public.app_current_role() in ('admin','auditor')
  or (public.app_current_role() = 'distributor' and id = public.app_current_distribution())
);
create policy distributions_insert on distributions for insert
  with check (public.app_current_role() = 'admin');
create policy distributions_update on distributions for update
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
create policy distributions_delete on distributions for delete
  using (public.app_current_role() = 'admin');

-- ============================ users ============================
-- SELECT: admin o la PROPIA fila (role=null incluido → única lectura permitida).
-- El AUDITOR ya NO lee la tabla users cruda (PII): sus labels van por la vista users_labels
-- (db/migrations/0001_auditor_labels.sql, ADR-0005 / DEBT-0004).
-- (Snapshot de referencia; la verdad aplicable a una DB desplegada es la migración 0001.)
create policy users_select on users for select using (
  public.app_current_role() = 'admin'
  or id = (select auth.uid())
);
-- INSERT: solo admin (alta de perfiles; el alta por signup la hace service_role/trigger).
create policy users_insert on users for insert
  with check (public.app_current_role() = 'admin');
-- UPDATE: admin (cualquiera) o self. El cambio de role/distribution_id propio lo BLOQUEA
-- el trigger forbid_self_privilege_escalation (defensa adicional a nivel columna).
create policy users_update on users for update
  using (public.app_current_role() = 'admin' or id = (select auth.uid()))
  with check (public.app_current_role() = 'admin' or id = (select auth.uid()));
create policy users_delete on users for delete
  using (public.app_current_role() = 'admin');

-- ============================ distribution_owners ============================
create policy downers_select on distribution_owners for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and distribution_id = public.app_current_distribution())
);
create policy downers_insert on distribution_owners for insert
  with check (public.app_current_role() = 'admin');
create policy downers_update on distribution_owners for update
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
create policy downers_delete on distribution_owners for delete
  using (public.app_current_role() = 'admin');

-- ============================ org_hierarchy (post-MVP, vacía pero protegida) ============================
create policy orgh_select on org_hierarchy for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and distribution_id = public.app_current_distribution())
);
create policy orgh_insert on org_hierarchy for insert
  with check (public.app_current_role() = 'admin');
create policy orgh_update on org_hierarchy for update
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
create policy orgh_delete on org_hierarchy for delete
  using (public.app_current_role() = 'admin');

-- ============================ task_categories ============================
-- SELECT: admin todo; distributor ve globales + las propias. (auditor: nada)
create policy cat_select on task_categories for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor'
      and (scope = 'global' or owner_user_id = (select auth.uid())))
);
-- INSERT: admin crea globales; distributor crea personales propias.
create policy cat_insert on task_categories for insert with check (
  (public.app_current_role() = 'admin' and scope = 'global' and owner_user_id is null
     and created_by = (select auth.uid()))
  or (public.app_current_role() = 'distributor' and scope = 'personal'
     and owner_user_id = (select auth.uid()) and created_by = (select auth.uid()))
);
create policy cat_update on task_categories for update using (
  (public.app_current_role() = 'admin' and scope = 'global')
  or (public.app_current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
) with check (
  (public.app_current_role() = 'admin' and scope = 'global')
  or (public.app_current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
);
create policy cat_delete on task_categories for delete using (
  (public.app_current_role() = 'admin' and scope = 'global')
  or (public.app_current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
);

-- ============================ tasks (distributor = SELF) ============================
create policy tasks_select on tasks for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
create policy tasks_insert on tasks for insert with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor'
      and owner_user_id = (select auth.uid())
      and distribution_id = public.app_current_distribution())
);
create policy tasks_update on tasks for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor'
      and owner_user_id = (select auth.uid())
      and distribution_id = public.app_current_distribution())
);
-- DELETE solo admin (ADR-0007): el distribuidor "borra" vía soft-delete (tasks.deleted_at, UPDATE self).
-- Evita que un hard-delete (cascade a task_instances) borre historial de incumplimiento del período en curso.
create policy tasks_delete on tasks for delete using (
  public.app_current_role() = 'admin'
);

-- ============================ task_instances (distributor = SELECT/UPDATE self) ============================
create policy ti_select on task_instances for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
-- INSERT/DELETE: solo admin (la materialización diaria la hace el job vía service_role).
create policy ti_insert on task_instances for insert
  with check (public.app_current_role() = 'admin');
create policy ti_update on task_instances for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
create policy ti_delete on task_instances for delete
  using (public.app_current_role() = 'admin');

-- ============================ metric_snapshots ============================
-- SELECT: admin + AUDITOR (todas) + el dueño. INSERT: admin (y service_role job). U/D: nadie (append-only).
create policy snap_select on metric_snapshots for select using (
  public.app_current_role() in ('admin','auditor')
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy snap_insert on metric_snapshots for insert
  with check (public.app_current_role() = 'admin');
-- (sin policies de UPDATE/DELETE → default-deny; además el trigger append-only bloquea a todos)

-- ============================ calendar_links (distributor CRUD self) ============================
create policy callinks_select on calendar_links for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy callinks_insert on calendar_links for insert with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy callinks_update on calendar_links for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy callinks_delete on calendar_links for delete using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);

-- ============================ calendar_sync_conflicts (distributor SELECT/UPDATE self) ============================
create policy conflicts_select on calendar_sync_conflicts for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy conflicts_insert on calendar_sync_conflicts for insert
  with check (public.app_current_role() = 'admin');
create policy conflicts_update on calendar_sync_conflicts for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy conflicts_delete on calendar_sync_conflicts for delete
  using (public.app_current_role() = 'admin');

-- ============================ notifications (distributor SELECT/UPDATE self) ============================
create policy notif_select on notifications for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy notif_insert on notifications for insert
  with check (public.app_current_role() = 'admin');
create policy notif_update on notifications for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy notif_delete on notifications for delete
  using (public.app_current_role() = 'admin');

-- =====================================================================
-- >>> db/migrations/0001_auditor_labels.sql
-- =====================================================================

-- ============================================================================
-- Royal Control — 0001_auditor_labels  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0005.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX].
--
-- DEBT-0004: el auditor leía la fila COMPLETA de users (email/phone/photo_url/preferences/
-- auth_providers = PII). Decisión (ADR-0005): el auditor lee SOLO labels (full_name +
-- distribution_id) vía esta vista, y se le retira el SELECT sobre la tabla users cruda.
-- ============================================================================

-- Vista de labels para admin/auditor.
--
-- ⚠ DEFINER A PROPÓSITO (security_invoker = false): la vista corre como su owner y BYPASSA la
-- RLS de users para poder ver TODAS las distribuciones. Es necesario porque al auditor se le
-- quita el SELECT-RLS sobre users (abajo): con security_invoker = true vería 0 filas.
-- El CONTROL DE ACCESO es el WHERE de rol + security_barrier + la proyección de columnas + el grant:
--   • WHERE public.app_current_role() in ('admin','auditor')  → distributor y role=null obtienen 0 filas.
--   • security_barrier = true                            → impide pushdown de predicados del usuario
--                                                          por debajo del gate (evita fugas).
--   • proyección id/full_name/distribution_id            → CERO PII.
-- NOTA: el linter de Supabase marcará "security definer view" como warning. Es INTENCIONAL y
-- está mitigado por lo anterior. No cambiar a security_invoker = true (rompería al auditor).
create view public.users_labels
  with (security_barrier = true, security_invoker = false) as
  select id, full_name, distribution_id
  from public.users
  where public.app_current_role() in ('admin', 'auditor');

grant select on public.users_labels to authenticated, service_role;  -- anon: sin acceso

-- Retirar al auditor el acceso a la tabla users cruda (queda: admin OR la propia fila).
-- El auditor arma el ranking con metric_snapshots ⨝ users_labels ⨝ distributions.
alter policy users_select on public.users
  using ( public.app_current_role() = 'admin' or id = (select auth.uid()) );

-- =====================================================================
-- >>> db/migrations/0002_auth_profile.sql
-- =====================================================================

-- ============================================================================
-- Royal Control — 0002_auth_profile  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0006.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX].
--
-- Capa DB de auth (ADR-0006, sub-paso 1/3). ADITIVO: NO toca users_select, users_labels ni
-- 0000_init → RLS y DEBT-0004 intactos. Dos triggers sobre el schema auth (gestionado por Supabase):
--   1) handle_new_user: crea el perfil public.users al signup (role=null, atómico, sin orfandad).
--   2) sync_auth_providers: mantiene users.auth_providers al vincular/desvincular identidades.
-- ============================================================================

-- ── 1) Perfil al signup ──────────────────────────────────────────────────────
-- AFTER INSERT on auth.users. SECURITY DEFINER (owner postgres) → bypassa la RLS de users
-- (INSERT solo-admin) e inserta el perfil. role=null + distribution_id=null cumplen el CHECK
-- rol↔distribución. Copia full_name y guarda la distribución DESEADA en preferences (jsonb),
-- sin tocar el schema de columnas. NO aborta el signup ante errores recuperables.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, role, distribution_id, preferences)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    null,
    null,
    jsonb_build_object('desired_distribution', new.raw_user_meta_data ->> 'desired_distribution')
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- No abortar el signup: si el perfil no se pudo crear, se registra y se trata como role=null.
    raise warning 'handle_new_user: perfil no creado para % (% / %)', new.id, sqlstate, sqlerrm;
    return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2) Sincronización de auth_providers ──────────────────────────────────────
-- AFTER INSERT OR DELETE on auth.identities. Recalcula el array desde auth.identities.
-- Supabase usa provider='email' para el método de contraseña → se MAPEA a 'password'
-- (consistente con DATA_MODEL: auth_providers = {'password','google'}).
create or replace function public.sync_auth_providers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.users
  set auth_providers = (
    select coalesce(array_agg(distinct m order by m), array[]::text[])
    from (
      select case when i.provider = 'email' then 'password' else i.provider end as m
      from auth.identities i
      where i.user_id = uid
    ) s
  )
  where id = uid;
  return coalesce(new, old);
end;
$$;

create trigger on_auth_identity_changed
  after insert or delete on auth.identities
  for each row execute function public.sync_auth_providers();

-- =====================================================================
-- >>> db/migrations/0003_tasks_engine.sql
-- =====================================================================

-- ============================================================================
-- Royal Control — 0003_tasks_engine  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0007.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX].
--
-- Motor de tareas (SPEC §7): materialización solo-hoy, recurrencia, edición de recurrentes
-- (vía columnas), soft-delete y hardening. ADITIVO: no toca 0000/0001/0002 ni la RLS salvo el
-- ALTER de tasks_delete (que va en lib/rls-policies/policies.sql). APP_TIMEZONE = 'America/Bogota'.
-- ============================================================================

-- ── Columnas nuevas ──────────────────────────────────────────────────────────
alter table public.tasks
  add column recurrence_until date,
  add column excluded_dates   date[] not null default '{}',
  add column deleted_at        timestamptz;

-- Overrides por ocurrencia ("solo este día"). NULL = hereda del task. (display = coalesce(instance.x, task.x))
alter table public.task_instances
  add column title       text,
  add column category_id uuid references public.task_categories(id) on delete set null,
  add column priority    public.task_priority,
  add column time_slot   time;

-- ── "Hoy" del sistema (TZ fija, ADR-0007) ────────────────────────────────────
create or replace function public.app_today()
returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Bogota')::date $$;

-- ── ¿Tarea due en la fecha D? ────────────────────────────────────────────────
create or replace function public.is_task_due(t public.tasks, d date)
returns boolean
language plpgsql stable set search_path = ''
as $$
begin
  if d < t.start_date then return false; end if;
  if t.recurrence_until is not null and d > t.recurrence_until then return false; end if;
  if d = any (t.excluded_dates) then return false; end if;

  case t.recurrence
    when 'once'    then return d = t.start_date;
    when 'daily'   then return true;
    when 'weekly'  then return ((d - t.start_date) % 7) = 0;
    when 'monthly' then
      -- mismo día-de-mes que start_date; en meses cortos, clamp al último día (31 → 30/28).
      return extract(day from d)::int = least(
        extract(day from t.start_date)::int,
        extract(day from (date_trunc('month', d::timestamp) + interval '1 month' - interval '1 day'))::int
      );
    else return false;
  end case;
end $$;

-- ── Materialización de un día (job + manual). SECURITY DEFINER → bypassa RLS para crear las filas. ──
create or replace function public.materialize_day(d date)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare created integer;
begin
  insert into public.task_instances (task_id, date)
  select t.id, d
  from public.tasks t
  where t.deleted_at is null
    and public.is_task_due(t, d)
  on conflict (task_id, date) do nothing;  -- idempotente
  get diagnostics created = row_count;
  return created;  -- status=0 por defecto; owner/distribution los rellena el trigger de 0000
end $$;

-- ── Alta inmediata: al crear una tarea due hoy, materializa su instancia de hoy ──
create or replace function public.materialize_task_today()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.deleted_at is null and public.is_task_due(new, public.app_today()) then
    insert into public.task_instances (task_id, date)
    values (new.id, public.app_today())
    on conflict (task_id, date) do nothing;
  end if;
  return new;
end $$;

create trigger trg_task_materialize_today
  after insert on public.tasks
  for each row execute function public.materialize_task_today();

-- ── Hardening: el scope desnormalizado y el task_id de una instancia son INMUTABLES ──
create or replace function public.forbid_instance_scope_change()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.owner_user_id   is distinct from old.owner_user_id
     or new.distribution_id is distinct from old.distribution_id
     or new.task_id         is distinct from old.task_id then
    raise exception 'task_instances: owner_user_id/distribution_id/task_id son inmutables';
  end if;
  return new;
end $$;

create trigger trg_ti_scope_immutable
  before update on public.task_instances
  for each row execute function public.forbid_instance_scope_change();

-- ── Quitar al distribuidor el hard-delete de tareas (integridad KPI). Solo admin. ──
-- (La policy canónica se sincroniza en lib/rls-policies/policies.sql; esto la aplica a una DB ya desplegada.)
alter policy tasks_delete on public.tasks
  using (public.app_current_role() = 'admin');

-- ── Programación diaria (pg_cron). GUARDADA: no rompe entornos sin pg_cron (p.ej. el harness). ──
-- pg_cron debe habilitarse en el proyecto Supabase (DEBT-0006). 00:05 America/Bogota = 05:05 UTC (UTC-5, sin DST).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'royal-control-materialize-day',
      '5 5 * * *',
      'select public.materialize_day(public.app_today())'
    );
  end if;
end $$;
