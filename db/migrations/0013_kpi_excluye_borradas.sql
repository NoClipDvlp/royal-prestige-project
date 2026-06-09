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
