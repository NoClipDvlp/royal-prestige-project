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
