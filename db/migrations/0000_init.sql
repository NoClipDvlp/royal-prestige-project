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
