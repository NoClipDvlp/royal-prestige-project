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
  add column duration_minutes int;

-- Override por ocurrencia ("solo este día"): coalesce(instance.duration_minutes, task.duration_minutes),
-- como los demás overrides de 0003. NULL = hereda del task.
alter table public.task_instances
  add column duration_minutes int;

-- ── CHECK de duración (tasks) ─────────────────────────────────────────────────
-- Reglas (ADR-0011 §1, Opción A confirmada por Nicolas 2026-06-03):
--   • duration_minutes > 0 SIEMPRE que no sea null.
--   • Tope de franja 22:00 SOLO cuando hay time_slot (no inventamos "duración ⇒ hora" a nivel DB;
--     la UI no-core decide si en la práctica exige hora). Filas existentes (duration null) pasan.
--
-- ⚠ CRÍTICO — sin `time_slot + interval`: en Postgres `time '21:00' + interval '3 hours'` = '00:00'
--   (ENVUELVE pasada medianoche) → un CHECK ingenuo daría 00:00 ≤ 22:00 = PASA (falso OK).
--   Se usa aritmética en MINUTOS desde medianoche: minuto_inicio + duración ≤ 22*60 (1320). Sin wrap.
alter table public.tasks
  add constraint chk_task_duration check (
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
alter table public.task_instances
  add constraint chk_ti_duration check (
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
