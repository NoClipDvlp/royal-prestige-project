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
