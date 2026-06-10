-- ============================================================================
-- Royal Control — 0019_bi_load_forecast  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0030.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-0030]. Commit con [CORE-APPROVED: ADR-0030].
--
-- Vista de auditor premium (ADR-0030), familia BI de ADR-0013 (DEFINER + gate de rol, SOLO AGREGADOS):
--   1) task_load_forecast: métrica NUEVA DESCRIPTIVA de CARGA futura (NO cumplimiento) — cuenta tareas
--      agendadas (is_task_due) en una ventana [d_start,d_end] por dimensión. Separada del KPI (ADR-0021).
--      Gate: admin/auditor → todos (respeta p_user/p_distribution); distribuidor → SU propia carga (forzado).
--   2) compliance_breakdown EXTENDIDO: + dimension distribution|distributor + p_distribution → drill
--      distribución→distribuidor→categoría. Gate admin/auditor-only (igual que 0006).
-- Índice de apoyo para el forward-looking. ADITIVA: no toca RLS/triggers/KPI histórico.
-- ============================================================================

-- Índice para acotar el barrido del forecast por distribución (vivas).
create index if not exists idx_tasks_distribution_live on public.tasks (distribution_id) where deleted_at is null;

-- ── 1. Carga futura (descriptiva) ─────────────────────────────────────────────
create or replace function public.task_load_forecast(
  d_start date, d_end date, dimension text, p_user uuid default null, p_distribution uuid default null
)
returns table (key text, label text, load int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := (select public.app_current_role());
  v_uid  uuid := (select auth.uid());
  eff_user uuid;
begin
  -- input malformado → ruidoso (bug del llamante)
  if dimension not in ('category', 'distribution', 'distributor') then
    raise exception 'task_load_forecast: dimension inválida %, use category|distribution|distributor', dimension;
  end if;
  -- gate de AUTORIZACIÓN (legítimo): admin/auditor = todos; distribuidor = lo suyo; resto = 0 filas.
  if v_role in ('admin'::public.app_role, 'auditor'::public.app_role) then
    eff_user := p_user;                 -- null = todos los distribuidores
  elsif v_role = 'distributor'::public.app_role then
    eff_user := v_uid;                  -- forzado a su propia carga (ignora p_user ajeno)
  else
    return;
  end if;

  return query
  with days as (
    select gs::date as d from generate_series(d_start, d_end, interval '1 day') gs
  ),
  cand as (
    select t.owner_user_id, t.distribution_id, t.category_id
    from public.tasks t
    cross join days
    where t.deleted_at is null
      and (eff_user is null or t.owner_user_id = eff_user)
      and (p_distribution is null or t.distribution_id = p_distribution)
      and public.is_task_due(t, days.d)
      and not (days.d = any (t.excluded_dates))
  )
  select
    case dimension
      when 'category'     then coalesce(cand.category_id::text, '∅')
      when 'distribution' then coalesce(cand.distribution_id::text, '∅')
      else                     cand.owner_user_id::text
    end as key,
    case dimension
      when 'category'     then coalesce(c.name, 'Sin categoría')
      when 'distribution' then coalesce(d2.name, '—')
      else                     coalesce(ul.full_name, '—')
    end as label,
    count(*)::int as load
  from cand
  left join public.task_categories c on dimension = 'category' and c.id = cand.category_id
  left join public.distributions d2  on dimension = 'distribution' and d2.id = cand.distribution_id
  left join public.users_labels ul   on dimension = 'distributor' and ul.id = cand.owner_user_id
  group by 1, 2
  order by load desc, label;
end $$;

revoke execute on function public.task_load_forecast(date, date, text, uuid, uuid) from public;
grant  execute on function public.task_load_forecast(date, date, text, uuid, uuid) to authenticated;

-- ── 2. compliance_breakdown extendido (drill) ─────────────────────────────────
-- Reemplaza la firma de 4 args por 5 (p_distribution default null → los llamados de 4 args siguen válidos).
drop function if exists public.compliance_breakdown(date, date, text, uuid);
create or replace function public.compliance_breakdown(
  d_start date, d_end date, dimension text, p_user uuid default null, p_distribution uuid default null
)
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
  if dimension not in ('category', 'priority', 'distribution', 'distributor') then
    raise exception 'compliance_breakdown: dimension inválida %, use category|priority|distribution|distributor', dimension;
  end if;

  return query
    select
      case dimension
        when 'priority'     then coalesce(ti.priority, t.priority)::text
        when 'category'     then coalesce(coalesce(ti.category_id, t.category_id)::text, '∅')
        when 'distribution' then ti.distribution_id::text
        else                     ti.owner_user_id::text
      end as key,
      case dimension
        when 'priority'     then coalesce(ti.priority, t.priority)::text
        when 'category'     then coalesce(c.name, 'Sin categoría')
        when 'distribution' then coalesce(d2.name, '—')
        else                     coalesce(ul.full_name, '—')
      end as label,
      count(*)::int,
      count(*) filter (where ti.status_pct = 100)::int,
      count(*) filter (where ti.status_pct = 50)::int,
      count(*) filter (where ti.status_pct = 0)::int,
      round(sum(public.priority_weight(coalesce(ti.priority, t.priority)) * ti.status_pct)::numeric
            / nullif(sum(public.priority_weight(coalesce(ti.priority, t.priority))), 0))::int
    from public.task_instances ti
    join public.tasks t on t.id = ti.task_id
      and t.deleted_at is null                 -- ADR-0021: el KPI excluye borradas (preserva 0013)
      and ti.date <> all (t.excluded_dates)    -- y "borrar solo este día"
    join public.users u on u.id = ti.owner_user_id and u.role = 'distributor'::public.app_role
    left join public.task_categories c on dimension = 'category' and c.id = coalesce(ti.category_id, t.category_id)
    left join public.distributions d2  on dimension = 'distribution' and d2.id = ti.distribution_id
    left join public.users_labels ul   on dimension = 'distributor' and ul.id = ti.owner_user_id
    where ti.date between d_start and least(d_end, public.app_today())
      and (p_user is null or ti.owner_user_id = p_user)
      and (p_distribution is null or ti.distribution_id = p_distribution)
    group by 1, 2;
end $$;

revoke execute on function public.compliance_breakdown(date, date, text, uuid, uuid) from public;
grant  execute on function public.compliance_breakdown(date, date, text, uuid, uuid) to authenticated;
