# ADR-0021 — El KPI excluye las tareas borradas (libertad sobre anti-gaming)

- **Estado:** aceptado
- **Fecha:** 2026-06-04
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (pre-flight pendiente)
- **¿Toca /core?:** SÍ → migración que actualiza las funciones de cálculo de KPI. **Revierte ADR-0007/0012**
  (que hacían contar las borradas). Aprobación humana 2026-06-04. DISCIPLINA REFORZADA.

## Contexto

ADR-0007/0012 decidieron que las instancias de tareas **borradas siguen contando** en el KPI
(anti-gaming: no se puede "limpiar" el cumplimiento borrando las no-hechas). Nicolas revierte esta
política: en su modelo **no hay auditoría estricta** — cada distribuidor/JD/vendedor tiene libertad
total de crear y borrar; el KPI solo refleja la lógica de lo que está vigente. La ética es de cada uno.

## Decisión

**El cálculo del KPI EXCLUYE las tareas borradas.** Borrar una tarea la saca del cómputo (sus instancias
pasadas y futuras), suba o baje el cumplimiento. Sin protección anti-gaming.

- Las funciones de cálculo (`compliance_self`, `compliance_ranking`, `compliance_series`,
  `compliance_breakdown`, `compliance_series_by_user`) deben **filtrar `tasks.deleted_at IS NULL`**
  (hoy NO lo hacen — ADR-0012 §4 lo prohibía explícitamente).
- **Borrar "solo este día"** (excluded_dates): esa ocurrencia también sale del KPI. *El mecanismo exacto
  (cómo se refleja una fecha excluida vs una instancia ya materializada) lo afina el Agente en pre-flight.*
- Consecuencia aceptada por Nicolas: borrar una recurrente bien-cumplida también quita su buen historial
  del KPI. Es la contrapartida de la libertad total.

## Qué se revierte
- ADR-0007/0012: "borradas cuentan / no filtrar deleted_at" → ahora **borradas no cuentan**.

## Riesgos
- **[MEDIO]** Filtro mal aplicado podría excluir tareas vivas o no excluir borradas → tests por función.
- **[BAJO]** Un usuario puede subir su KPI borrando no-hechas. **Aceptado por diseño** (sin auditoría estricta).

## Verificación
- Tests por cada función: una tarea borrada (deleted_at) NO aparece en el KPI; una viva sí; "borrar solo
  este día" excluye esa fecha. Retrocompat: el resto del cálculo (ponderación, rangos) intacto. Build verde.

## Trazabilidad
- Revierte **ADR-0007, ADR-0012**; relaciona ADR-0013/0014 (funciones BI). Core: nueva migración que
  reescribe (create or replace) las 5 funciones de cálculo añadiendo el filtro `deleted_at`.
