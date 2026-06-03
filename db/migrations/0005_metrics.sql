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
