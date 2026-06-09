# ADR-0024 — Emoji por ítem de plantilla (campo, no auto)

- **Estado:** aceptado
- **Fecha:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (pre-flight)
- **¿Toca /core?:** SÍ → migración (columna `template_items.emoji`). El resto (editor + render del print) es no-core.

## Contexto

El cronograma impreso mostraba una caja en blanco "Tu emoji" para dibujar a mano. Decisión de producto:
el emoji debe ser un **dato que el admin elige/edita por ítem de plantilla** (no auto por keyword, no a mano),
y se muestra en el **cronograma impreso de la plantilla**. "Solo de plantillas" (no en la tarea del distribuidor).

## Decisión

**Opción A (elegida): columna `template_items.emoji`.**

- Migración `0015_template_item_emoji.sql` (CORE): `alter table public.template_items add column emoji text;`
  + `check (emoji is null or char_length(emoji) <= 16)`. Nullable, aditiva. No toca motor/RLS/triggers.
- **Editor de plantilla (admin, no-core):** campo de emoji por ítem (crear + editar). Campo libre (el admin
  pega el emoji que quiera).
- **Print de plantilla (no-core):** muestra el emoji del ítem en la tarjeta.
- **Alcance:** el emoji vive en `template_items` → se ve en el **print de plantilla**. NO se propaga a
  `tasks` ni al print del distribuidor (decisión "solo de plantillas"). Si en el futuro se quiere también
  en el print del distribuidor → `tasks.emoji` + propagación (otro ADR/core).

## Alternativa descartada
- **Opción B (no-core):** emoji como prefijo del título. Descartada: ensucia el título (se ve en la tarea
  del distribuidor) y es frágil al editar. La columna dedicada es la versión limpia.

## Riesgos
- **[BAJO]** Columna nullable aditiva; CHECK de longitud. Sin impacto en el motor ni en datos existentes.

## Verificación
- Migración aplica en el harness (run.sh) y en el consolidado idempotente (2×). Build verde. Tras el wiring:
  el admin pone un emoji a un ítem → aparece en el cronograma impreso de la plantilla.

## Trazabilidad
- Complementa el feature de impresión (timeline). Core: migración 0015. No-core: editor (templates-manager
  + templates.ts) + render (print-schedule). Relaciona ADR-0018 (plantillas).
