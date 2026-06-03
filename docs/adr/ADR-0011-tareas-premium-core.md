# ADR-0011 — Core del hito Tareas premium: duración, RPC de proyección y memoización

- **Estado:** aceptado
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — diseño solo-análisis
- **¿Toca /core?:** SÍ → `db/migrations/0004_tasks_premium.sql` (duración + RPC) y `lib/auth/**`
  (memoización). Aprobación humana: 2026-06-03 (Nicolas, vía Orquestador). Ejecución con
  **DISCIPLINA REFORZADA** (core-guard caído, DEBT-0001 ítem 1).

## Contexto

El hito "Tareas premium" necesita tres cosas que tocan core: (1) **duración** de tareas (hoy solo
hay hora de inicio); (2) una **fuente única** para proyectar las tareas de días futuros en la
navegación de días, evitando duplicar la lógica de recurrencia en TS (riesgo de drift con la verdad
SQL); (3) **performance**: `getUser()` se llama 2–3 veces por navegación (middleware + layout +
page), cada una con un round-trip de red.

## Decisión

### 1. Duración de tareas (`db/migrations/0004`)
- `tasks.duration_minutes int null` (null = comportamiento actual, "punto" en la franja) + override
  `task_instances.duration_minutes int null` (coalesce instancia→task, como los demás overrides).
- CHECK: `duration_minutes > 0` y que `time_slot + duration` no pase de las **22:00** (clamp/validación a la franja).
- **El KPI NO pondera por duración** (Nicolas, 2026-06-03): el cumplimiento sigue ponderado por
  **prioridad** (1/2/3). La duración es visual/organizativa (bloques en la franja), no entra en la fórmula.
- **Impacto mínimo confirmado**: NO toca `is_task_due`, `materialize_day` ni la RLS (las policies son
  por fila; cubren columnas nuevas). Solape permitido (apilado visual, decisión de UI no-core).

### 2. RPC `tasks_due_on(d date)` — proyección de día (`db/migrations/0004`)
Función read-only **`SECURITY INVOKER`** (respeta la RLS self del usuario): devuelve las tareas del
usuario que son due en `d` según `is_task_due` (excluyendo `deleted_at`). Es la **fuente única** para
pintar días futuros (que no tienen `task_instances` materializadas) sin reimplementar la recurrencia en
TS. Pasado/hoy siguen leyendo `task_instances` reales.

### 3. Memoización de sesión (`lib/auth/**`)
Envolver `getUser()` y `getProfile()` con **`React cache()`** (memoización por-request) → 1 validación
de JWT + 1 query de rol por request, en vez de 2–3. **Sigue siendo `getUser()`** (validado), NUNCA
`getSession()`; `cache()` solo evita repetir la misma llamada dentro del mismo request.

### 4. Índices
Verificar en pre-flight: `idx_ti_owner_date (owner_user_id, date)` ya existe (0000_init §6) y cubre los
listados por usuario+fecha. **Solo añadir índices si el pre-flight detecta un faltante real.**

## Qué se borró / simplificó

- El **espejo TS de `is_task_due`** para el futuro: descartado → se usa la RPC `tasks_due_on` (sin drift).
- Ponderar el KPI por duración: descartado (KPI por prioridad en v1).

## Riesgos

- **[MEDIO] Aplicar la migración 0004 en Supabase**: como en cada cambio de schema, Nicolas la aplica
  en el SQL Editor (se añade al consolidado/DEPLOY). Hasta entonces, la duración/RPC no existen en prod.
- **[BAJO] `cache()` mal usado** (global en vez de por-request) rompería el aislamiento → debe ser el
  `cache` de React (per-request), verificado en revisión.
- **[BAJO] `tasks_due_on` definer por error** filtraría tareas entre usuarios → debe ser `SECURITY INVOKER`
  (respeta RLS self). Cubrir con test.

## Verificación obligatoria

- Tests harness: `duration_minutes` CHECK (>0, tope 22:00); `tasks_due_on(d)` devuelve las due correctas
  por recurrencia y respeta RLS self (un usuario no ve las de otro); sin regresión 20–23.
- `cache()`: una sola llamada a `getUser`/query de rol por request (verificación de código + test si es factible).
- Build verde. Re-aplicar 0004 en Supabase (Nicolas).

## Trazabilidad

- Relaciona: `ADR-0007` (motor), `ADR-0009` (UI por rol), `DEBT-0001`, `DEBT-0005` (cerrada con el re-clone).
- Archivos core: `db/migrations/0004_tasks_premium.sql`, `lib/auth/**`.
- No-core (hitos siguientes): day-nav UI, modal drag-create, quick-add home, DayView con bloques, Suspense.
- Marcador: `[CORE-APPROVED: ADR-0011]` (válido solo con estado = aceptado).
