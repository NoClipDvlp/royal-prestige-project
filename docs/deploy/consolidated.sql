-- ============================================================================
-- Royal Control — SQL CONSOLIDADO DE DEPLOY (GENERADO — IDEMPOTENTE, re-ejecutable)
-- Fuente: migraciones + RLS del repo. Orden: 0000 → policies → 0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0008 → 0009 → 0010 → 0011 → 0012 → 0013 → 0014 → 0015.
-- ⚠ Re-ejecutable sin importar el estado (corre 2 veces sin error): create ... if not exists,
--    do-guards de enums, create or replace trigger/view/function, drop policy if exists + create,
--    add column if not exists, drop constraint if exists + add. NO cambia el diseño (DEBT-0011).
-- Aplicar en Supabase (SQL Editor o psql). Ver docs/DEPLOY.md (pg_cron, OAuth, email, env, primer admin).
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
do $$ begin if not exists (select 1 from pg_type where typname = 'app_role') then create type app_role as enum ('admin','auditor','distributor','jd','seller'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname = 'category_scope') then create type category_scope as enum ('global','personal'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname = 'task_origin') then create type task_origin as enum ('self','superior'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname = 'task_priority') then create type task_priority as enum ('low','medium','high'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname = 'recurrence_type') then create type recurrence_type as enum ('once','daily','weekly','monthly'); end if; end $$;
do $$ begin if not exists (select 1 from pg_type where typname = 'snapshot_period') then create type snapshot_period as enum ('monthly','quarterly'); end if; end $$;

-- ----------------------------------------------------------------------------
-- Tablas
-- ----------------------------------------------------------------------------
create table if not exists distributions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo_url   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
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

create table if not exists distribution_owners (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references distributions(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  owner_slot      smallint not null check (owner_slot between 1 and 3),
  created_at      timestamptz not null default now(),
  unique (distribution_id, user_id),
  unique (distribution_id, owner_slot)         -- tope DURO de 3 owners, sin carrera
);

-- Jerarquía post-MVP: existe y con RLS activa, pero NO se puebla en MVP.
create table if not exists org_hierarchy (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  parent_user_id  uuid references users(id) on delete set null,
  distribution_id uuid not null references distributions(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create table if not exists task_categories (
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

create table if not exists tasks (
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
create table if not exists task_instances (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references tasks(id) on delete cascade,
  date            date not null,
  status_pct      smallint not null default 0 check (status_pct in (0,50,100)),
  completed_at    timestamptz,
  distribution_id uuid not null references distributions(id),  -- desnormalizado
  owner_user_id   uuid not null references users(id),          -- desnormalizado
  unique (task_id, date)                                       -- idempotencia del job
);

create table if not exists metric_snapshots (
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

create table if not exists calendar_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  google_calendar_id text not null,
  sync_direction     text not null default 'push_only',
  scopes             text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table if not exists calendar_sync_conflicts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  task_instance_id uuid not null references task_instances(id) on delete cascade,
  type             text not null,
  resolved         boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists notifications (
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

create or replace trigger trg_distributions_updated before update on distributions
  for each row execute function public.set_updated_at();
create or replace trigger trg_users_updated before update on users
  for each row execute function public.set_updated_at();
create or replace trigger trg_tasks_updated before update on tasks
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
create or replace trigger trg_ti_scope before insert on task_instances
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
create or replace trigger trg_task_scope_immutable before update on tasks
  for each row execute function public.forbid_task_scope_change();

-- metric_snapshots: APPEND-ONLY (ni admin ni service_role recalculan). Invariante de DATA_MODEL #6.
create or replace function public.forbid_snapshot_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'metric_snapshots es append-only (sin UPDATE/DELETE)';
end $$;
create or replace trigger trg_snapshot_no_update before update on metric_snapshots
  for each row execute function public.forbid_snapshot_mutation();
create or replace trigger trg_snapshot_no_delete before delete on metric_snapshots
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
create or replace trigger trg_users_no_priv_esc before update on users
  for each row execute function public.forbid_self_privilege_escalation();

-- ----------------------------------------------------------------------------
-- Índices (ADR §6) — RLS-perf + queries
-- ----------------------------------------------------------------------------
create index if not exists idx_users_distribution on users(distribution_id);
create index if not exists idx_users_role on users(role);
create index if not exists idx_tasks_distribution on tasks(distribution_id);
create index if not exists idx_tasks_owner on tasks(owner_user_id);
create index if not exists idx_tasks_start_date on tasks(start_date);
create index if not exists idx_tasks_category on tasks(category_id);
create index if not exists idx_ti_dist_date on task_instances(distribution_id, date);
create index if not exists idx_ti_owner_date on task_instances(owner_user_id, date);
create index if not exists idx_snap_user on metric_snapshots(user_id);
create index if not exists idx_snap_period on metric_snapshots(period, period_start);
create index if not exists idx_downers_distribution on distribution_owners(distribution_id);
create index if not exists idx_downers_user on distribution_owners(user_id);
create index if not exists idx_cat_scope on task_categories(scope);
create index if not exists idx_cat_owner on task_categories(owner_user_id);
create index if not exists idx_orgh_distribution on org_hierarchy(distribution_id);
create index if not exists idx_orgh_parent on org_hierarchy(parent_user_id);
create index if not exists idx_orgh_user on org_hierarchy(user_id);
create index if not exists idx_callinks_user on calendar_links(user_id);
create index if not exists idx_conflicts_user on calendar_sync_conflicts(user_id);
create index if not exists idx_notif_user on notifications(user_id);

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
drop policy if exists distributions_select on distributions;
create policy distributions_select on distributions for select using (
  public.app_current_role() in ('admin','auditor')
  or (public.app_current_role() = 'distributor' and id = public.app_current_distribution())
);
drop policy if exists distributions_insert on distributions;
create policy distributions_insert on distributions for insert
  with check (public.app_current_role() = 'admin');
drop policy if exists distributions_update on distributions;
create policy distributions_update on distributions for update
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
drop policy if exists distributions_delete on distributions;
create policy distributions_delete on distributions for delete
  using (public.app_current_role() = 'admin');

-- ============================ users ============================
-- SELECT: admin o la PROPIA fila (role=null incluido → única lectura permitida).
-- El AUDITOR ya NO lee la tabla users cruda (PII): sus labels van por la vista users_labels
-- (db/migrations/0001_auditor_labels.sql, ADR-0005 / DEBT-0004).
-- (Snapshot de referencia; la verdad aplicable a una DB desplegada es la migración 0001.)
drop policy if exists users_select on users;
create policy users_select on users for select using (
  public.app_current_role() = 'admin'
  or id = (select auth.uid())
);
-- INSERT: solo admin (alta de perfiles; el alta por signup la hace service_role/trigger).
drop policy if exists users_insert on users;
create policy users_insert on users for insert
  with check (public.app_current_role() = 'admin');
-- UPDATE: admin (cualquiera) o self. El cambio de role/distribution_id propio lo BLOQUEA
-- el trigger forbid_self_privilege_escalation (defensa adicional a nivel columna).
drop policy if exists users_update on users;
create policy users_update on users for update
  using (public.app_current_role() = 'admin' or id = (select auth.uid()))
  with check (public.app_current_role() = 'admin' or id = (select auth.uid()));
drop policy if exists users_delete on users;
create policy users_delete on users for delete
  using (public.app_current_role() = 'admin');

-- ============================ distribution_owners ============================
drop policy if exists downers_select on distribution_owners;
create policy downers_select on distribution_owners for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and distribution_id = public.app_current_distribution())
);
drop policy if exists downers_insert on distribution_owners;
create policy downers_insert on distribution_owners for insert
  with check (public.app_current_role() = 'admin');
drop policy if exists downers_update on distribution_owners;
create policy downers_update on distribution_owners for update
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
drop policy if exists downers_delete on distribution_owners;
create policy downers_delete on distribution_owners for delete
  using (public.app_current_role() = 'admin');

-- ============================ org_hierarchy (post-MVP, vacía pero protegida) ============================
drop policy if exists orgh_select on org_hierarchy;
create policy orgh_select on org_hierarchy for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and distribution_id = public.app_current_distribution())
);
drop policy if exists orgh_insert on org_hierarchy;
create policy orgh_insert on org_hierarchy for insert
  with check (public.app_current_role() = 'admin');
drop policy if exists orgh_update on org_hierarchy;
create policy orgh_update on org_hierarchy for update
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
drop policy if exists orgh_delete on org_hierarchy;
create policy orgh_delete on org_hierarchy for delete
  using (public.app_current_role() = 'admin');

-- ============================ task_categories ============================
-- SELECT: admin todo; distributor ve globales + las propias. (auditor: nada)
drop policy if exists cat_select on task_categories;
create policy cat_select on task_categories for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor'
      and (scope = 'global' or owner_user_id = (select auth.uid())))
);
-- INSERT: admin crea globales; distributor crea personales propias.
drop policy if exists cat_insert on task_categories;
create policy cat_insert on task_categories for insert with check (
  (public.app_current_role() = 'admin' and scope = 'global' and owner_user_id is null
     and created_by = (select auth.uid()))
  or (public.app_current_role() = 'distributor' and scope = 'personal'
     and owner_user_id = (select auth.uid()) and created_by = (select auth.uid()))
);
drop policy if exists cat_update on task_categories;
create policy cat_update on task_categories for update using (
  (public.app_current_role() = 'admin' and scope = 'global')
  or (public.app_current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
) with check (
  (public.app_current_role() = 'admin' and scope = 'global')
  or (public.app_current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
);
drop policy if exists cat_delete on task_categories;
create policy cat_delete on task_categories for delete using (
  (public.app_current_role() = 'admin' and scope = 'global')
  or (public.app_current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
);

-- ============================ tasks (distributor = SELF) ============================
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor'
      and owner_user_id = (select auth.uid())
      and distribution_id = public.app_current_distribution())
);
drop policy if exists tasks_update on tasks;
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
drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete using (
  public.app_current_role() = 'admin'
);

-- ============================ task_instances (distributor = SELECT/UPDATE self) ============================
drop policy if exists ti_select on task_instances;
create policy ti_select on task_instances for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
-- INSERT/DELETE: solo admin (la materialización diaria la hace el job vía service_role).
drop policy if exists ti_insert on task_instances;
create policy ti_insert on task_instances for insert
  with check (public.app_current_role() = 'admin');
drop policy if exists ti_update on task_instances;
create policy ti_update on task_instances for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
drop policy if exists ti_delete on task_instances;
create policy ti_delete on task_instances for delete
  using (public.app_current_role() = 'admin');

-- ============================ metric_snapshots ============================
-- SELECT: admin + AUDITOR (todas) + el dueño. INSERT: admin (y service_role job). U/D: nadie (append-only).
drop policy if exists snap_select on metric_snapshots;
create policy snap_select on metric_snapshots for select using (
  public.app_current_role() in ('admin','auditor')
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists snap_insert on metric_snapshots;
create policy snap_insert on metric_snapshots for insert
  with check (public.app_current_role() = 'admin');
-- (sin policies de UPDATE/DELETE → default-deny; además el trigger append-only bloquea a todos)

-- ============================ calendar_links (distributor CRUD self) ============================
drop policy if exists callinks_select on calendar_links;
create policy callinks_select on calendar_links for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists callinks_insert on calendar_links;
create policy callinks_insert on calendar_links for insert with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists callinks_update on calendar_links;
create policy callinks_update on calendar_links for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists callinks_delete on calendar_links;
create policy callinks_delete on calendar_links for delete using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);

-- ============================ calendar_sync_conflicts (distributor SELECT/UPDATE self) ============================
drop policy if exists conflicts_select on calendar_sync_conflicts;
create policy conflicts_select on calendar_sync_conflicts for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists conflicts_insert on calendar_sync_conflicts;
create policy conflicts_insert on calendar_sync_conflicts for insert
  with check (public.app_current_role() = 'admin');
drop policy if exists conflicts_update on calendar_sync_conflicts;
create policy conflicts_update on calendar_sync_conflicts for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists conflicts_delete on calendar_sync_conflicts;
create policy conflicts_delete on calendar_sync_conflicts for delete
  using (public.app_current_role() = 'admin');

-- ============================ notifications (distributor SELECT/UPDATE self) ============================
drop policy if exists notif_select on notifications;
create policy notif_select on notifications for select using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists notif_insert on notifications;
create policy notif_insert on notifications for insert
  with check (public.app_current_role() = 'admin');
drop policy if exists notif_update on notifications;
create policy notif_update on notifications for update using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'distributor' and user_id = (select auth.uid()))
);
drop policy if exists notif_delete on notifications;
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
create or replace view public.users_labels
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

create or replace trigger on_auth_user_created
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

create or replace trigger on_auth_identity_changed
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
  add column if not exists recurrence_until date,
  add column if not exists excluded_dates   date[] not null default '{}',
  add column if not exists deleted_at        timestamptz;

-- Overrides por ocurrencia ("solo este día"). NULL = hereda del task. (display = coalesce(instance.x, task.x))
alter table public.task_instances
  add column if not exists title       text,
  add column if not exists category_id uuid references public.task_categories(id) on delete set null,
  add column if not exists priority    public.task_priority,
  add column if not exists time_slot   time;

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

create or replace trigger trg_task_materialize_today
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

create or replace trigger trg_ti_scope_immutable
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

-- =====================================================================
-- >>> db/migrations/0004_tasks_premium.sql
-- =====================================================================
-- ============================================================================
-- Royal Control — 0004_tasks_premium  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0011.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0011].
--
-- Hito "Tareas premium" — parte core (ADR-0011):
--   1) Duración de tareas (tasks.duration_minutes) + override por ocurrencia (task_instances).
--   2) RPC tasks_due_on(d) SECURITY INVOKER → fuente única de proyección de días futuros.
-- ADITIVO: NO toca is_task_due, materialize_day, los triggers, ni la RLS de ninguna tabla.
-- El KPI NO pondera por duración (sigue por prioridad, ADR-0011 §1). La duración es visual/organizativa.
-- ============================================================================

-- ── 1. Duración de tareas ─────────────────────────────────────────────────────
-- null = comportamiento actual ("punto" en la franja). Cuando se fija, es un bloque en la franja.
alter table public.tasks
  add column if not exists duration_minutes int;

-- Override por ocurrencia ("solo este día"): coalesce(instance.duration_minutes, task.duration_minutes),
-- como los demás overrides de 0003. NULL = hereda del task.
alter table public.task_instances
  add column if not exists duration_minutes int;

-- ── CHECK de duración (tasks) ─────────────────────────────────────────────────
-- Reglas (ADR-0011 §1, Opción A confirmada por Nicolas 2026-06-03):
--   • duration_minutes > 0 SIEMPRE que no sea null.
--   • Tope de franja 22:00 SOLO cuando hay time_slot (no inventamos "duración ⇒ hora" a nivel DB;
--     la UI no-core decide si en la práctica exige hora). Filas existentes (duration null) pasan.
--
-- ⚠ CRÍTICO — sin `time_slot + interval`: en Postgres `time '21:00' + interval '3 hours'` = '00:00'
--   (ENVUELVE pasada medianoche) → un CHECK ingenuo daría 00:00 ≤ 22:00 = PASA (falso OK).
--   Se usa aritmética en MINUTOS desde medianoche: minuto_inicio + duración ≤ 22*60 (1320). Sin wrap.
alter table public.tasks drop constraint if exists chk_task_duration;
alter table public.tasks add constraint chk_task_duration check (
    duration_minutes is null
    or (
      duration_minutes > 0
      and (
        time_slot is null
        or (extract(epoch from time_slot)::int / 60 + duration_minutes) <= 22 * 60
      )
    )
  );

-- ── CHECK de duración (task_instances / override) ─────────────────────────────
-- Mismo principio. ⚠ LIMITACIÓN DOCUMENTADA (ADR-0011, riesgo MEDIO): un CHECK de fila NO puede
-- ver la fila `tasks` padre, así que NO puede validar el tope contra el time_slot EFECTIVO
-- (coalesce instancia→task). Aquí se garantiza `>0` SIEMPRE y el tope SOLO cuando la instancia
-- TAMBIÉN sobrescribe time_slot. La validación del tope sobre el time_slot efectivo (cuando la
-- instancia hereda la hora del task) vive en la SERVER ACTION (no-core, hito siguiente).
-- NO asumir que el tope del efectivo está cubierto a nivel DB.
alter table public.task_instances drop constraint if exists chk_ti_duration;
alter table public.task_instances add constraint chk_ti_duration check (
    duration_minutes is null
    or (
      duration_minutes > 0
      and (
        time_slot is null
        or (extract(epoch from time_slot)::int / 60 + duration_minutes) <= 22 * 60
      )
    )
  );

-- ── 2. RPC de proyección de día: tasks_due_on(d) ─────────────────────────────
-- Fuente ÚNICA para pintar días FUTUROS (sin task_instances materializadas) sin reimplementar la
-- recurrencia en TS (evita drift con la verdad SQL). Pasado/hoy siguen leyendo task_instances reales.
--
-- ⚠ SECURITY INVOKER (NO definer): corre con privilegios del invocador → la RLS self de `tasks`
--   (tasks_select: distributor ve solo lo propio; admin todo) filtra ANTES de is_task_due. Un DEFINER
--   por error (owner = superuser con bypassrls) filtraría tareas entre usuarios. INVOKER es obligatorio.
-- search_path='' → todo schema-cualificado (hardening anti-search-path, como el resto de funciones).
-- Excluye deleted_at (soft-delete, ADR-0007). is_task_due es STABLE y no-definer → sin escalada.
create or replace function public.tasks_due_on(d date)
returns setof public.tasks
language sql
stable
security invoker
set search_path = ''
as $$
  select t.*
  from public.tasks t
  where t.deleted_at is null
    and public.is_task_due(t, d)
$$;

-- Sólo `authenticated` invoca el RPC (anon = sin acceso a negocio, 0000_init GRANTs). La RLS hace
-- el gating real de filas; esto restringe el verbo EXECUTE. No toca la RLS de ninguna tabla.
revoke execute on function public.tasks_due_on(date) from public;
grant  execute on function public.tasks_due_on(date) to authenticated;

-- ── 3. Índices ────────────────────────────────────────────────────────────────
-- Verificado (ADR-0011 §4): idx_ti_owner_date (owner_user_id, date) ya existe (0000_init §6) y cubre
-- los listados por usuario+fecha. tasks_due_on filtra por RLS (idx_tasks_owner) + is_task_due (no
-- indexable: función sobre la fila). NO se añade ningún índice (no hay faltante real).

-- =====================================================================
-- >>> db/migrations/0005_metrics.sql
-- =====================================================================
-- ============================================================================
-- Royal Control — 0005_metrics  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0012.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0012].
--
-- Motor de MÉTRICAS vivo (SPEC §8, ADR-0012): cumplimiento ponderado por prioridad.
--   1) priority_weight(p): peso 1/2/3 (low/medium/high). IMMUTABLE.
--   2) compliance_self(d_start,d_end): KPI del PROPIO usuario. SECURITY INVOKER → la RLS self protege.
--   3) compliance_ranking(d_start,d_end): ranking admin/auditor. SECURITY DEFINER + gate de rol;
--      devuelve SOLO agregados + ids (cero títulos/horas → preserva la frontera PII de ADR-0005).
-- ADITIVO: NO toca RLS, triggers, ni otras tablas. Snapshots congelados quedan FUERA (diferidos).
--
-- Fórmula del % ponderado (status_pct ∈ {0,50,100} → el ÷100 y ×100 se cancelan):
--   compliance_pct = round( Σ(w·status_pct) / Σ(w) ),  w = priority_weight(coalesce(ti.priority,t.priority))
-- ⚠ CRÍTICO: división ENTERA trunca en Postgres → se castea el numerador a NUMERIC ANTES de dividir
--   (si no, 62.5 → 62). round(numeric) es half-away-from-zero → casa con Math.round de summarizeWeek (valores 0–100).
-- NO se filtra deleted_at: las instancias de tareas borradas SÍ cuentan al KPI histórico (ADR-0007).
-- d_end se capa a app_today() → los días futuros no inflan ni penalizan.
-- ============================================================================

-- ── 1. Peso por prioridad ─────────────────────────────────────────────────────
create or replace function public.priority_weight(p public.task_priority)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p when 'high' then 3 when 'medium' then 2 when 'low' then 1 end
$$;

-- ── 2. KPI propio (SECURITY INVOKER → respeta la RLS self de ti_select/tasks_select) ──
-- Una sola fila (agregado sobre las instancias propias del rango). Fuente ÚNICA de la fórmula
-- (reemplazará a summarizeWeek en el cableado del home — sub-hito UI no-core siguiente).
create or replace function public.compliance_self(d_start date, d_end date)
returns table (
  total          int,
  done           int,
  half           int,
  undone         int,
  compliance_pct int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::int,
    count(*) filter (where ti.status_pct = 100)::int,
    count(*) filter (where ti.status_pct = 50)::int,
    count(*) filter (where ti.status_pct = 0)::int,
    round(
      sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
      / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0)
    )::int
  from public.task_instances ti
  join public.tasks t on t.id = ti.task_id
  where ti.date between d_start and least(d_end, public.app_today());
$$;

-- ── 3. Ranking admin/auditor (SECURITY DEFINER + gate de rol) ─────────────────
-- ⚠ DEFINER: el auditor NO tiene RLS sobre task_instances/tasks (a propósito, ADR-0005) → un INVOKER
--   le daría 0 filas. El gate interno por app_current_role() (que lee el auth.uid() del JWT del
--   invocador, aun dentro de DEFINER) es el control de acceso. Devuelve SOLO agregados + ids: NUNCA
--   títulos/horas → mantiene la minimización PII. Dos granularidades vía discriminador `grain`:
--     • 'user'         → una fila por usuario role='distributor' (user_id + distribution_id)
--     • 'distribution' → rollup AGREGANDO sobre las instancias (Σ(w·status)/Σ(w)), NO promedio de promedios.
--   Σw=0 (sin datos) → NULLIF → compliance_pct NULL (nunca 0%).
create or replace function public.compliance_ranking(d_start date, d_end date)
returns table (
  grain           text,
  user_id         uuid,
  distribution_id uuid,
  total           int,
  done            int,
  half            int,
  undone          int,
  compliance_pct  int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Gate fail-closed: solo admin/auditor. Distribuidor / role=null / sin sesión → 0 filas.
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return;
  end if;

  return query
  with base as (
    select
      ti.owner_user_id,
      ti.distribution_id,
      ti.status_pct,
      public.priority_weight(coalesce(ti.priority, t.priority)) as w
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    where ti.date between d_start and least(d_end, public.app_today())
  )
  -- Grano USUARIO (una fila por distribuidor)
  select
    'user'::text,
    b.owner_user_id,
    b.distribution_id,
    count(*)::int,
    count(*) filter (where b.status_pct = 100)::int,
    count(*) filter (where b.status_pct = 50)::int,
    count(*) filter (where b.status_pct = 0)::int,
    round(sum(b.w * b.status_pct)::numeric / nullif(sum(b.w), 0))::int
  from base b
  group by b.owner_user_id, b.distribution_id
  union all
  -- Grano DISTRIBUCIÓN (rollup por agregación, NO promedio de promedios)
  select
    'distribution'::text,
    null::uuid,
    b.distribution_id,
    count(*)::int,
    count(*) filter (where b.status_pct = 100)::int,
    count(*) filter (where b.status_pct = 50)::int,
    count(*) filter (where b.status_pct = 0)::int,
    round(sum(b.w * b.status_pct)::numeric / nullif(sum(b.w), 0))::int
  from base b
  group by b.distribution_id;
end $$;

-- ── GRANTs: solo authenticated invoca (anon = sin acceso a negocio, 0000_init). ──
-- priority_weight necesita grant a authenticated porque compliance_self (INVOKER) lo llama como el rol llamante.
revoke execute on function public.priority_weight(public.task_priority) from public;
grant  execute on function public.priority_weight(public.task_priority) to authenticated;
revoke execute on function public.compliance_self(date, date) from public;
grant  execute on function public.compliance_self(date, date) to authenticated;
revoke execute on function public.compliance_ranking(date, date) from public;
grant  execute on function public.compliance_ranking(date, date) to authenticated;

-- =====================================================================
-- >>> db/migrations/0006_bi.sql
-- =====================================================================
-- ============================================================================
-- Royal Control — 0006_bi  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0013.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0013].
--
-- Motor de BI (SPEC §8, ADR-0013): cumplimiento por bucket temporal y por dimensión, para las
-- superficies admin/auditor (perfil de un distribuidor con p_user / ranking-ampliado con p_user=null).
-- DOS funciones DEFINER **admin/auditor-only** (el distribuidor usa compliance_self de 0005).
--   1) compliance_series(d_start,d_end,bucket,p_user)   — serie temporal (day/week/month).
--   2) compliance_breakdown(d_start,d_end,dimension,p_user) — desglose (category/priority).
-- SOLO AGREGADOS: cero títulos/horas en la salida (frontera PII de ADR-0005). No hay 3ª RPC de títulos.
-- ADITIVA: no toca RLS, triggers ni otras tablas.
--
-- Asimetría de errores (ADR-0013): rol no autorizado → return 0 filas (autorización legítima);
-- bucket/dimension fuera de whitelist → raise (bug del llamante). El texto validado se pasa como VALOR
-- a date_trunc (NO format/execute → sin inyección). Bucketeo TZ-safe: ti.date ya es fecha de Bogotá;
-- solo d_end usa app_today(). Semana = lunes (Postgres date_trunc). pct con cast a numeric (como 0005).
-- ============================================================================

-- ── 1. Serie temporal ─────────────────────────────────────────────────────────
create or replace function public.compliance_series(d_start date, d_end date, bucket text, p_user uuid default null)
returns table (
  bucket_start   date,
  total          int,
  done           int,
  half           int,
  undone         int,
  compliance_pct int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Gate de AUTORIZACIÓN (legítimo) → 0 filas para distribuidor / role=null / sin sesión.
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return;
  end if;
  -- Input MALFORMADO (bug del llamante) → ruidoso. Whitelist; el valor validado va como parámetro a date_trunc.
  if bucket not in ('day', 'week', 'month') then
    raise exception 'compliance_series: bucket inválido %, use day|week|month', bucket;
  end if;

  return query
    select
      (date_trunc(bucket, ti.date))::date as bucket_start,
      count(*)::int,
      count(*) filter (where ti.status_pct = 100)::int,
      count(*) filter (where ti.status_pct = 50)::int,
      count(*) filter (where ti.status_pct = 0)::int,
      round(sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
            / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0))::int
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    where ti.date between d_start and least(d_end, public.app_today())
      and (p_user is null or ti.owner_user_id = p_user)   -- p_user no-distribuidor → la join lo filtra a 0
    group by 1
    order by 1;
end $$;

-- ── 2. Desglose por dimensión ─────────────────────────────────────────────────
create or replace function public.compliance_breakdown(d_start date, d_end date, dimension text, p_user uuid default null)
returns table (
  key            text,
  label          text,
  total          int,
  done           int,
  half           int,
  undone         int,
  compliance_pct int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return;
  end if;
  if dimension not in ('category', 'priority') then
    raise exception 'compliance_breakdown: dimension inválida %, use category|priority', dimension;
  end if;

  -- priority: key/label = prioridad efectiva (la app localiza). category: key = id (o '∅'), label = nombre
  -- (resuelto DENTRO del DEFINER — el auditor no lee task_categories) / 'Sin categoría' si null. Override gana.
  return query
    select
      case when dimension = 'priority'
           then coalesce(ti.priority, t.priority)::text
           else coalesce(coalesce(ti.category_id, t.category_id)::text, '∅') end as key,
      case when dimension = 'priority'
           then coalesce(ti.priority, t.priority)::text
           else coalesce(c.name, 'Sin categoría') end as label,
      count(*)::int,
      count(*) filter (where ti.status_pct = 100)::int,
      count(*) filter (where ti.status_pct = 50)::int,
      count(*) filter (where ti.status_pct = 0)::int,
      round(sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
            / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0))::int
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    left join public.task_categories c
      on dimension = 'category' and c.id = coalesce(ti.category_id, t.category_id)
    where ti.date between d_start and least(d_end, public.app_today())
      and (p_user is null or ti.owner_user_id = p_user)
    group by 1, 2;
end $$;

-- ── GRANTs: solo authenticated; la autorización fina la hace el gate de rol interno. ──
revoke execute on function public.compliance_series(date, date, text, uuid) from public;
grant  execute on function public.compliance_series(date, date, text, uuid) to authenticated;
revoke execute on function public.compliance_breakdown(date, date, text, uuid) from public;
grant  execute on function public.compliance_breakdown(date, date, text, uuid) to authenticated;

-- =====================================================================
-- >>> db/migrations/0008_templates.sql
-- =====================================================================
-- ============================================================================
-- Royal Control — 0008_templates  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0015.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0015].
--
-- Plantillas de tareas — Fase 1 (estructura + RLS). ADR-0015.
--   task_templates (global) → template_items (blueprints de tarea, SIN start_date) → template_assignments
--   (qué distribuidores la tienen). tasks gana template_id/template_item_id (provenance) + customized_at
--   (señal de "el distribuidor editó esta tarea de plantilla" → la propagación de Fase 2 NO la pisa).
-- ADITIVA: NO toca el motor (is_task_due/materialize_day/triggers) ni la RLS de tasks/task_instances.
-- La asignación/propagación/desasignación y el seteo de customized_at son Fase 2 (no-core).
-- ============================================================================

-- ── Tablas ───────────────────────────────────────────────────────────────────
create table if not exists public.task_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid not null references public.users(id),
  deleted_at  timestamptz,                        -- soft-delete (la plantilla no rompe tareas ya materializadas)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Blueprint de tarea: forma sin start_date (el ancla la pone la asignación en Fase 2).
create table if not exists public.template_items (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.task_templates(id) on delete cascade,  -- parte de la plantilla
  title            text not null,
  category_id      uuid references public.task_categories(id) on delete set null,
  priority         public.task_priority not null default 'medium',
  recurrence       public.recurrence_type not null default 'once',
  time_slot        time,
  duration_minutes int,
  created_at       timestamptz not null default now(),
  -- Espejo del CHECK de 0004 (aritmética en MINUTOS, sin wrap de medianoche): >0 y tope franja 22:00.
  constraint chk_template_item_duration check (
    duration_minutes is null
    or (
      duration_minutes > 0
      and (time_slot is null or (extract(epoch from time_slot)::int / 60 + duration_minutes) <= 22 * 60)
    )
  )
);

create table if not exists public.template_assignments (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  assigned_by uuid not null references public.users(id),
  assigned_at timestamptz not null default now(),
  active      boolean not null default true,       -- desasignado = false (conserva el registro)
  unique (template_id, user_id)                    -- un assignment por par (semántica de re-asignar = Fase 2)
);

-- ── Vínculo en tasks (provenance + señal de edición del distribuidor) ─────────
-- ON DELETE SET NULL (NO cascade): borrar una plantilla deja las tareas del distribuidor VIVAS y su KPI
-- histórico intacto (línea dura de ADR-0007). customized_at: lo setea la edición del distribuidor (Fase 2);
-- NULL = intacta (la propagación puede actualizar), NOT NULL = editada (la propagación NO pisa).
alter table public.tasks
  add column if not exists template_id      uuid references public.task_templates(id) on delete set null,
  add column if not exists template_item_id uuid references public.template_items(id) on delete set null,
  add column if not exists customized_at    timestamptz;

-- ── Índices (FK lookups + propagación de Fase 2) ─────────────────────────────
create index if not exists idx_template_items_template on public.template_items(template_id);
create index if not exists idx_tassign_template on public.template_assignments(template_id);
create index if not exists idx_tassign_user on public.template_assignments(user_id);
create index if not exists idx_tasks_template_item on public.tasks(template_item_id);

-- ── updated_at de task_templates (reusa el helper de 0000) ────────────────────
create or replace trigger trg_templates_updated before update on public.task_templates
  for each row execute function public.set_updated_at();

-- ── RLS: las 3 tablas de plantilla son ADMIN-ONLY (default-deny para el resto) ──
-- El distribuidor/auditor NO leen plantillas; las tareas materializadas se operan con la RLS EXISTENTE
-- de tasks/task_instances (owner=self) — las columnas nuevas son metadato de la propia fila, ya cubiertas.
do $$
declare t text;
begin
  foreach t in array array['task_templates','template_items','template_assignments'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force  row level security;', t);
  end loop;
end $$;

drop policy if exists templates_admin on public.task_templates;
create policy templates_admin on public.task_templates for all
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
drop policy if exists template_items_admin on public.template_items;
create policy template_items_admin on public.template_items for all
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
drop policy if exists template_assignments_admin on public.template_assignments;
create policy template_assignments_admin on public.template_assignments for all
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');

-- ── GRANTs (la RLS gatea por rol; anon sin acceso) ───────────────────────────
grant select, insert, update, delete on
  public.task_templates, public.template_items, public.template_assignments to authenticated;
grant all on public.task_templates, public.template_items, public.template_assignments to service_role;

-- =====================================================================
-- >>> db/migrations/0009_series_by_user.sql
-- =====================================================================
-- ============================================================================
-- Royal Control — 0009_series_by_user  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0014.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0014].
--
-- Sparkline por distribuidor en el ranking (ADR-0014, familia ADR-0013/BI). Igual que compliance_series
-- (0006) pero agrupado TAMBIÉN por owner_user_id (sin p_user) → UNA llamada devuelve la serie temporal de
-- TODOS los distribuidores (1 round-trip para el ranking entero, en vez de N — Opción B del análisis).
-- DEFINER admin/auditor-only. SOLO agregados + user_id (cero títulos, ADR-0005). ADITIVA: sin RLS ni motor.
-- (Nº 0009: llena el hueco reservado; 0008 = plantillas, 0010 = trigger customized.)
-- ============================================================================

create or replace function public.compliance_series_by_user(d_start date, d_end date, bucket text)
returns table (
  user_id        uuid,
  bucket_start   date,
  total          int,
  done           int,
  half           int,
  undone         int,
  compliance_pct int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return; -- gate de autorización → 0 filas (distribuidor/role-null)
  end if;
  if bucket not in ('day', 'week', 'month') then
    raise exception 'compliance_series_by_user: bucket inválido %, use day|week|month', bucket;
  end if;

  return query
    select
      ti.owner_user_id,
      (date_trunc(bucket, ti.date))::date as bucket_start,
      count(*)::int,
      count(*) filter (where ti.status_pct = 100)::int,
      count(*) filter (where ti.status_pct = 50)::int,
      count(*) filter (where ti.status_pct = 0)::int,
      round(sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
            / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0))::int
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    where ti.date between d_start and least(d_end, public.app_today())
    group by ti.owner_user_id, 2
    order by ti.owner_user_id, 2;
end $$;

revoke execute on function public.compliance_series_by_user(date, date, text) from public;
grant  execute on function public.compliance_series_by_user(date, date, text) to authenticated;

-- =====================================================================
-- >>> db/migrations/0010_customized_trigger.sql
-- =====================================================================
-- ============================================================================
-- Royal Control — 0010_customized_trigger  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0016.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0016].
--
-- Plantillas Fase 2c (ADR-0016): marca tasks.customized_at cuando el DISTRIBUIDOR edita la DEFINICIÓN de
-- una tarea vinculada a una plantilla → la propagación no-destructiva (no-core) la respeta (no pisa).
-- La invariante vive en la DB → cubre TODOS los paths del distribuidor (presentes y futuros) sin que
-- ninguna server action tenga que recordar marcarla.
--
-- ⚠ GATE POR ROL (corazón del mecanismo): solo marca cuando app_current_role()='distributor'. La
--   PROPAGACIÓN corre como admin y el JOB como service_role (rol null) → NO marcan → la propagación no se
--   auto-marca (si lo hiciera, la 2ª propagación se saltaría todo). BEFORE UPDATE (no INSERT → asignar no marca).
-- ADITIVA: no toca RLS ni el motor (is_task_due/materialize_day).
-- ============================================================================

create or replace function public.mark_task_customized()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select public.app_current_role()) = 'distributor'::public.app_role
     and new.template_item_id is not null
     and (
          new.title            is distinct from old.title
       or new.time_slot        is distinct from old.time_slot
       or new.priority         is distinct from old.priority
       or new.category_id      is distinct from old.category_id
       or new.recurrence       is distinct from old.recurrence
       or new.duration_minutes is distinct from old.duration_minutes
     )
  then
    new.customized_at := now();
  end if;
  return new;
end $$;

create or replace trigger trg_tasks_mark_customized
  before update on public.tasks
  for each row execute function public.mark_task_customized();

-- =====================================================================
-- >>> db/migrations/0011_user_delete_fks.sql
-- =====================================================================
-- 0011_user_delete_fks.sql — ADR-0017: integridad del borrado de usuario.
--
-- PROBLEMA: borrar un usuario (auth.users → cascade public.users) fallaba con 23503 porque 4 FKs → users(id)
-- estaban en NO ACTION (sin `on delete`). El comentario "CASCADE borra todo" de adminDeleteUser era falso.
--
-- FIX (ADR-0017):
--   • Autoría de artefactos COMPARTIDOS → nullable + ON DELETE SET NULL (sobreviven sin autor):
--       task_categories.created_by, task_templates.created_by, template_assignments.assigned_by.
--   • Desnormalizados de task_instances → ON DELETE CASCADE:
--       task_instances.owner_user_id (→users), task_instances.distribution_id (→distributions).
--
-- Categorías PERSONALES del usuario: NO necesitan trato especial — ya las borra el cascade existente de
-- task_categories.owner_user_id, y chk_category_scope EXIGE personal⇒owner NOT NULL (no pueden quedar huérfanas).
--
-- Idempotente: `alter column drop not null` es idempotente; FKs vía `drop constraint if exists` + `add`.

-- 1) Columnas de autoría → nullable (metadata-only; NO reescribe filas existentes).
alter table public.task_categories      alter column created_by  drop not null;
alter table public.task_templates       alter column created_by  drop not null;
alter table public.template_assignments alter column assigned_by drop not null;

-- 2) FKs de autoría → ON DELETE SET NULL.
alter table public.task_categories
  drop constraint if exists task_categories_created_by_fkey;
alter table public.task_categories
  add  constraint task_categories_created_by_fkey
    foreign key (created_by) references public.users(id) on delete set null;

alter table public.task_templates
  drop constraint if exists task_templates_created_by_fkey;
alter table public.task_templates
  add  constraint task_templates_created_by_fkey
    foreign key (created_by) references public.users(id) on delete set null;

alter table public.template_assignments
  drop constraint if exists template_assignments_assigned_by_fkey;
alter table public.template_assignments
  add  constraint template_assignments_assigned_by_fkey
    foreign key (assigned_by) references public.users(id) on delete set null;

-- 3) Desnormalizados de task_instances → ON DELETE CASCADE.
alter table public.task_instances
  drop constraint if exists task_instances_owner_user_id_fkey;
alter table public.task_instances
  add  constraint task_instances_owner_user_id_fkey
    foreign key (owner_user_id) references public.users(id) on delete cascade;

alter table public.task_instances
  drop constraint if exists task_instances_distribution_id_fkey;
alter table public.task_instances
  add  constraint task_instances_distribution_id_fkey
    foreign key (distribution_id) references public.distributions(id) on delete cascade;

-- =====================================================================
-- >>> db/migrations/0012_weekly_multiday.sql
-- =====================================================================
-- 0012_weekly_multiday.sql — ADR-0019: recurrencia semanal multi-día (estilo Google Calendar).
--
-- `weekly` gana un conjunto de días: weekdays smallint[] (1=lun … 7=dom, isodow), en tasks y template_items.
-- NULL/empty = LEGACY (día de start_date = comportamiento ACTUAL) → retrocompatible: ninguna weekly
-- existente cambia (la columna nace NULL; cero backfill).
--
-- ADITIVO: solo añade columnas + reescribe is_task_due (rama weekly). materialize_day / materialize_task_today
-- / tasks_due_on NO cambian (todos llaman a is_task_due → heredan el multi-día).
-- Idempotente: add column (if not exists vía consolidado), drop constraint if exists + add, create or replace.

-- ── 1) Columna de días (tasks + template_items) ──────────────────────────────
alter table public.tasks          add column if not exists weekdays smallint[];
alter table public.template_items add column if not exists weekdays smallint[];

-- ── 2) CHECK: NULL/empty permitido (legacy); si hay valores → todos en 1..7, sin NULLs internos, ≤7 ──
alter table public.tasks          drop constraint if exists chk_tasks_weekdays;
alter table public.tasks          add  constraint chk_tasks_weekdays check (
  weekdays is null
  or (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
      and array_position(weekdays, null::smallint) is null
      and cardinality(weekdays) <= 7)
);
alter table public.template_items drop constraint if exists chk_template_items_weekdays;
alter table public.template_items add  constraint chk_template_items_weekdays check (
  weekdays is null
  or (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
      and array_position(weekdays, null::smallint) is null
      and cardinality(weekdays) <= 7)
);

-- ── 3) is_task_due: la rama weekly aprende el filtro de días (legacy si weekdays NULL/empty) ──
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
    when 'weekly'  then
      -- multi-día (ADR-0019): due si el día de la semana ∈ weekdays; NULL/empty = día de start_date (legacy).
      if t.weekdays is null or cardinality(t.weekdays) = 0 then
        return ((d - t.start_date) % 7) = 0;
      else
        return extract(isodow from d)::int = any (t.weekdays); -- isodow: 1=lun … 7=dom
      end if;
    when 'monthly' then
      -- mismo día-de-mes que start_date; en meses cortos, clamp al último día (31 → 30/28).
      return extract(day from d)::int = least(
        extract(day from t.start_date)::int,
        extract(day from (date_trunc('month', d::timestamp) + interval '1 month' - interval '1 day'))::int
      );
    else return false;
  end case;
end $$;

-- =====================================================================
-- >>> db/migrations/0013_kpi_excluye_borradas.sql
-- =====================================================================
-- 0013_kpi_excluye_borradas.sql — ADR-0021: el KPI EXCLUYE las tareas borradas (revierte ADR-0007/0012 §4).
--
-- Las 5 funciones de cálculo añaden al JOIN con tasks:
--     and t.deleted_at is null              → excluye tareas soft-deleted (sus instancias no cuentan)
--     and ti.date <> all(t.excluded_dates)  → excluye "borrar solo este día" (fecha en excluded_dates;
--                                              la instancia sigue materializada pero NO cuenta)
-- excluded_dates es NOT NULL default '{}' → `<> all('{}')` es TRUE (no afecta a las no-excluidas).
-- Resto del cálculo INTACTO: ponderación por prioridad (::numeric), rangos, buckets, gates de rol.
-- Idempotente: create or replace de las 5 funciones (mismas firmas que 0005/0006/0009).

-- ── 1) compliance_self (0005) ─────────────────────────────────────────────────
create or replace function public.compliance_self(d_start date, d_end date)
returns table (total int, done int, half int, undone int, compliance_pct int)
language sql stable security invoker set search_path = ''
as $$
  select
    count(*)::int,
    count(*) filter (where ti.status_pct = 100)::int,
    count(*) filter (where ti.status_pct = 50)::int,
    count(*) filter (where ti.status_pct = 0)::int,
    round(
      sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
      / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0)
    )::int
  from public.task_instances ti
  join public.tasks t on t.id = ti.task_id
    and t.deleted_at is null
    and ti.date <> all(t.excluded_dates)
  where ti.date between d_start and least(d_end, public.app_today());
$$;

-- ── 2) compliance_ranking (0005) ──────────────────────────────────────────────
create or replace function public.compliance_ranking(d_start date, d_end date)
returns table (
  grain text, user_id uuid, distribution_id uuid,
  total int, done int, half int, undone int, compliance_pct int
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return;
  end if;

  return query
  with base as (
    select
      ti.owner_user_id,
      ti.distribution_id,
      ti.status_pct,
      public.priority_weight(coalesce(ti.priority, t.priority)) as w
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
      and t.deleted_at is null
      and ti.date <> all(t.excluded_dates)
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    where ti.date between d_start and least(d_end, public.app_today())
  )
  select
    'user'::text, b.owner_user_id, b.distribution_id,
    count(*)::int,
    count(*) filter (where b.status_pct = 100)::int,
    count(*) filter (where b.status_pct = 50)::int,
    count(*) filter (where b.status_pct = 0)::int,
    round(sum(b.w * b.status_pct)::numeric / nullif(sum(b.w), 0))::int
  from base b
  group by b.owner_user_id, b.distribution_id
  union all
  select
    'distribution'::text, null::uuid, b.distribution_id,
    count(*)::int,
    count(*) filter (where b.status_pct = 100)::int,
    count(*) filter (where b.status_pct = 50)::int,
    count(*) filter (where b.status_pct = 0)::int,
    round(sum(b.w * b.status_pct)::numeric / nullif(sum(b.w), 0))::int
  from base b
  group by b.distribution_id;
end $$;

-- ── 3) compliance_series (0006) ───────────────────────────────────────────────
create or replace function public.compliance_series(d_start date, d_end date, bucket text, p_user uuid default null)
returns table (bucket_start date, total int, done int, half int, undone int, compliance_pct int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return;
  end if;
  if bucket not in ('day', 'week', 'month') then
    raise exception 'compliance_series: bucket inválido %, use day|week|month', bucket;
  end if;

  return query
    select
      (date_trunc(bucket, ti.date))::date as bucket_start,
      count(*)::int,
      count(*) filter (where ti.status_pct = 100)::int,
      count(*) filter (where ti.status_pct = 50)::int,
      count(*) filter (where ti.status_pct = 0)::int,
      round(sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
            / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0))::int
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
      and t.deleted_at is null
      and ti.date <> all(t.excluded_dates)
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    where ti.date between d_start and least(d_end, public.app_today())
      and (p_user is null or ti.owner_user_id = p_user)
    group by 1
    order by 1;
end $$;

-- ── 4) compliance_breakdown (0006) ────────────────────────────────────────────
create or replace function public.compliance_breakdown(d_start date, d_end date, dimension text, p_user uuid default null)
returns table (key text, label text, total int, done int, half int, undone int, compliance_pct int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return;
  end if;
  if dimension not in ('category', 'priority') then
    raise exception 'compliance_breakdown: dimension inválida %, use category|priority', dimension;
  end if;

  return query
    select
      case when dimension = 'priority'
           then coalesce(ti.priority, t.priority)::text
           else coalesce(coalesce(ti.category_id, t.category_id)::text, '∅') end as key,
      case when dimension = 'priority'
           then coalesce(ti.priority, t.priority)::text
           else coalesce(c.name, 'Sin categoría') end as label,
      count(*)::int,
      count(*) filter (where ti.status_pct = 100)::int,
      count(*) filter (where ti.status_pct = 50)::int,
      count(*) filter (where ti.status_pct = 0)::int,
      round(sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
            / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0))::int
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
      and t.deleted_at is null
      and ti.date <> all(t.excluded_dates)
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    left join public.task_categories c
      on dimension = 'category' and c.id = coalesce(ti.category_id, t.category_id)
    where ti.date between d_start and least(d_end, public.app_today())
      and (p_user is null or ti.owner_user_id = p_user)
    group by 1, 2;
end $$;

-- ── 5) compliance_series_by_user (0009) ───────────────────────────────────────
create or replace function public.compliance_series_by_user(d_start date, d_end date, bucket text)
returns table (user_id uuid, bucket_start date, total int, done int, half int, undone int, compliance_pct int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select public.app_current_role()) not in ('admin'::public.app_role, 'auditor'::public.app_role) then
    return;
  end if;
  if bucket not in ('day', 'week', 'month') then
    raise exception 'compliance_series_by_user: bucket inválido %, use day|week|month', bucket;
  end if;

  return query
    select
      ti.owner_user_id,
      (date_trunc(bucket, ti.date))::date as bucket_start,
      count(*)::int,
      count(*) filter (where ti.status_pct = 100)::int,
      count(*) filter (where ti.status_pct = 50)::int,
      count(*) filter (where ti.status_pct = 0)::int,
      round(sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
            / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0))::int
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
      and t.deleted_at is null
      and ti.date <> all(t.excluded_dates)
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    where ti.date between d_start and least(d_end, public.app_today())
    group by ti.owner_user_id, 2
    order by ti.owner_user_id, 2;
end $$;

-- =====================================================================
-- >>> db/migrations/0014_must_set_password.sql
-- =====================================================================
-- 0014_must_set_password.sql — ADR-0022: forzar set-password BULLETPROOF (cierra ERROR 1).
--
-- El flag pasa de app_metadata (que dependía del flujo del enlace) a una COLUMNA en public.users, leída
-- FRESCA en el middleware (cubre TODAS las rutas + server actions, sin staleness de JWT). Un trigger impide
-- que el propio usuario se lo limpie (anti-self-clear): solo admin (sesión) o el sistema (service_role,
-- app_current_role() null) pueden cambiarlo. La RLS ya impide que un no-admin escriba filas ajenas; este
-- trigger blinda además la columna en la PROPIA fila.
--
-- Aditivo: solo añade columna + trigger. Idempotente (add column → if not exists vía consolidado;
-- create or replace function; create or replace trigger → or replace vía consolidado).

alter table public.users add column if not exists must_set_password boolean not null default false;

create or replace function public.forbid_must_set_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.must_set_password is distinct from old.must_set_password then
    -- Permitido SOLO a: el SISTEMA (service_role / sin sujeto JWT → auth.uid() null) o un ADMIN.
    -- Un usuario autenticado (auth.uid() NO null) jamás toca su propio flag, tenga el rol que tenga
    -- — incluido role=null (cuenta recién creada): app_current_role() null por falta de rol NO es 'sistema'.
    -- `is distinct from` trata null como «distinto de admin» → también bloquea al usuario sin rol.
    if (select auth.uid()) is not null
       and (select public.app_current_role()) is distinct from 'admin'::public.app_role then
      raise exception 'no puedes modificar must_set_password';
    end if;
  end if;
  return new;
end $$;

create or replace trigger trg_users_must_set_password
  before update on public.users
  for each row execute function public.forbid_must_set_password_change();

-- =====================================================================
-- >>> db/migrations/0015_template_item_emoji.sql
-- =====================================================================
-- 0015_template_item_emoji.sql — ADR-0024: emoji por ítem de plantilla.
--
-- El admin elige/edita un emoji por ítem de plantilla; se muestra en el cronograma IMPRESO de la plantilla
-- (no en la del distribuidor — "solo de plantillas"). Aditivo: columna nullable + CHECK de longitud para
-- evitar texto largo. NO toca el motor (is_task_due/materialize), ni la RLS (template_items_admin = for all),
-- ni los triggers. Idempotente vía consolidado (add column → if not exists; drop constraint + add).

alter table public.template_items add column if not exists emoji text;

alter table public.template_items drop constraint if exists chk_template_item_emoji;
alter table public.template_items add constraint chk_template_item_emoji check (emoji is null or char_length(emoji) <= 16);
