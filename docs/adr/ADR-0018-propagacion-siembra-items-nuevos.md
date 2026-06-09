# ADR-0018 — Propagación de plantillas siembra items nuevos en asignados existentes

- **Estado:** aceptado
- **Fecha:** 2026-06-04
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (diagnóstico)
- **¿Toca /core?:** NO (server action, reusa el motor). **Revierte ADR-0015 §5** (que difería esto).

## Contexto

QA #11: el admin edita una plantilla, **crea tareas nuevas** (items nuevos) y da "propagar", pero el
distribuidor ya asignado **no las ve**. Diagnóstico: no es bug — la propagación de *campos* de items
existentes funciona (ADR-0016); pero `propagateTemplate` solo hace `UPDATE`, **nunca `INSERT`**, así que
un item nuevo (sin `template_item_id` en ninguna tarea del asignado) no se materializa. Eso es justo lo
que ADR-0015 §5 difirió a "solo-futuras". Nicolas ahora lo quiere activo.

## Decisión

**Propagar = propagar campos + sembrar items nuevos.** `propagateTemplate` además **inserta** las tareas
de los `template_items` que un asignado **activo** aún no tiene (mismo patrón que `assignTemplate`, reusa
el motor de materialización; sin schema nuevo → no-core).

- Solo asignados con `active=true`.
- "Solo futuras" sigue existiendo como opción (no siembra; solo cambia el item para futuras asignaciones).
- **Idempotente**: no duplica un item ya sembrado (chequea existencia por `template_item_id` + owner).
- El display histórico de días pasados no-customizados refleja la definición actual (override NULL →
  `coalesce` cae al task). **Aceptable**: no afecta el KPI (`status_pct`), solo la etiqueta mostrada.

## Qué se revierte
- ADR-0015 §5: "añadir items en la propagación → solo-futuras". Ahora **propagar siembra items nuevos**.

## Riesgos
- **[BAJO]** Atomicidad del bulk (UPDATE existentes + INSERT nuevos) — recuperable, idempotente (DEBT-0007).
- **[BAJO]** Sembrar respeta `customized_at`/borrados del distribuidor (no pisa lo suyo; solo añade lo que falta).

## Verificación
- Tests: tras crear un item nuevo y propagar, los asignados activos reciben la tarea nueva (materializada
  hoy si due); re-propagar no duplica; un asignado inactivo no la recibe; las tareas editadas por el
  distribuidor (`customized_at`) no se tocan. Build verde.

## Trazabilidad
- Revierte/actualiza **ADR-0015 §5**; relaciona ADR-0016 (propagación). No-core: `lib/actions/templates.ts`.
