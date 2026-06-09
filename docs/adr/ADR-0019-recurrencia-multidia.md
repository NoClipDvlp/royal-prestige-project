# ADR-0019 — Recurrencia semanal multi-día (estilo Google Calendar)

- **Estado:** aceptado
- **Fecha:** 2026-06-04
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo técnico:** Agente (pre-flight pendiente)
- **¿Toca /core?:** SÍ → `db/migrations/0012` (schema + `is_task_due`). Aprobación humana 2026-06-04.
  **DISCIPLINA REFORZADA**. QA #6.

## Contexto

Hoy la recurrencia `weekly` no especifica **qué** día(s) de la semana → una tarea semanal cae en un día
implícito (el de `start_date`). Nicolas (QA #6): al elegir "semanal" el usuario debe poder marcar
**uno o varios** días (L/M/X/J/V/S/D), como Google Calendar. Aplica a **tareas** (distribuidor) y a
**plantillas** (`template_items`, que materializan tareas).

## Decisión

### 1. Producto: weekly multi-día (Nicolas, 2026-06-04)
La recurrencia `weekly` lleva un conjunto de **días de la semana** (uno o varios). "Cada lunes y
miércoles", etc. La UI: selector multi-día estilo GCal (chips L/M/X/J/V/S/D) cuando recurrence=weekly.

### 2. Modelo + motor (el "cómo" lo afina el Agente en pre-flight)
- Un campo nuevo en `tasks` **y** `template_items` para los días (p.ej. `weekdays smallint[]` con
  1=lunes…7=domingo, o un bitmask) — el Agente propone la representación + el `CHECK`.
- **`is_task_due`** (core) evalúa: si recurrence=weekly, la fecha es due **solo si su día de la semana
  está en el conjunto** (respetando TZ America/Bogota, como hoy).
- **Retrocompatibilidad (línea dura):** las tareas/plantillas `weekly` **existentes** (sin días) deben
  seguir funcionando — default = el día de `start_date` (comportamiento actual). El Agente define cómo
  (default al materializar, o NULL = día de start_date en `is_task_due`). Ninguna tarea en prod debe
  romperse al aplicar la migración.

### 3. Alcance
- `daily`/`monthly`/`once` no cambian. Solo `weekly` gana los días.
- La materialización (`materialize_day`) y el resto del motor no cambian su contrato; solo `is_task_due`
  aprende el filtro de día.

## Qué se borró / simplificó
- "Un solo día" → descartado (Nicolas eligió multi-día GCal).

## Riesgos
- **[ALTO]** Romper las `weekly` existentes en prod → la migración debe ser retrocompatible (default =
  día de start_date). Test obligatorio.
- **[MEDIO]** `is_task_due` mal evaluado (TZ / índice de día) → tests por cada día de la semana.

## Verificación obligatoria
- Tests: weekly con {lunes,miércoles} → due solo lun/mié; weekly sin días (legacy) → due el día de
  start_date (sin regresión); daily/monthly/once intactos; TZ Bogota correcta. Build verde. Aplicar `0012`.

## Trazabilidad
- Relaciona `ADR-0007` (motor), `ADR-0015` (plantillas — `template_items` gana el campo).
- Core: `db/migrations/0012`. No-core: selector multi-día en quick-add, modal de tarea, item-form de plantilla.
- Marcador: `[CORE-APPROVED: ADR-0019]`.
