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
  using (auth.current_role() = 'admin');

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
