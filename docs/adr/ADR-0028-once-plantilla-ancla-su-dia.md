# ADR-0028 — Una tarea "once" de plantilla se materializa en SU día, no en la fecha de asignación

- **Estado:** aceptado
- **Fecha:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Orquestador (diagnóstico sobre código)
- **¿Toca /core?:** **NO** (server actions `lib/actions/templates.ts`; el motor `is_task_due` no se toca).
  Si el Agente descubre que EXIGE tocar core → PARA y reporta para ADR aparte.

## Contexto

Bug reportado por Nicolas: el admin crea una plantilla con tareas **"una vez"** en días distintos del
cronograma; al **imprimir** la plantilla (admin) cada once aparece en su día correcto, pero al **asignarla
a un distribuidor** todas las once se materializan **el mismo día** (la fecha de asignación).

**Causa raíz (verificada):** el día de una once en la plantilla se guarda en `template_items.weekdays`
(isodow). El comentario `templates.ts:28-29` lo declara **print-only**: la impresión lo usa, pero la
materialización (`assignTemplate` y la siembra de ADR-0018) inserta **toda** tarea con `start_date = today`,
y el motor materializa una once **exactamente en `start_date`, ignorando `weekdays`** (correcto, por diseño).
→ Todas las once nacen en la fecha de asignación. La impresión y la materialización divergen.

## Decisión

La materialización de una **once de plantilla** ancla su `start_date` a **su día del cronograma**, no a
`today`. Regla:

1. **once CON `weekdays`** → `start_date` = el día (isodow de `weekdays[0]`) **dentro de la semana de la
   asignación** (la semana que contiene `today`, lunes-base como el resto del sistema). **Si ese día ya
   pasó respecto a `today`** → el mismo isodow de la **semana siguiente** (la tarea no nace vencida).
2. **once SIN `weekdays`** → `start_date = today` (fallback; comportamiento actual).
3. Aplica a la **asignación inicial** (`assignTemplate`) y a la **siembra de items nuevos** en propagación
   (ADR-0018). Cada once calcula su propio `start_date` → caen en días distintos, como en la impresión.
4. **El motor NO cambia:** `is_task_due` sigue materializando una once por su `start_date`. Solo cambia el
   `start_date` que el server action inserta. **No-core.**

## Qué se borró / alineó
- Se borra la **divergencia** entre impresión (usa `weekdays`) y materialización (la ignoraba). Una sola
  verdad: la once cae en su día del cronograma en ambas.
- Refina ADR-0015 §3 ("`start_date` = fecha de asignación") **solo para once con día**; el resto
  (recurrentes anclan en la fecha de asignación) queda igual.

## Alcance / fuera de alcance
- **Dentro:** asignación inicial + siembra de items nuevos.
- **Fuera (follow-up si no es trivial):** que **editar el día** de una once ya asignada y propagar mueva el
  `start_date` de las tareas intactas. El reporte es sobre la asignación; si el Agente ve que el mismo punto
  lo cubre barato, que lo incluya; si no, lo reporta como follow-up (no bloquea este fix).

## Riesgos
- **[BAJO]** "Semana de asignación" mal calculada (offset de lunes-base / zona Bogotá) → reusar el helper
  de semana existente (`lib/dashboard/week`), no reinventar. Test con once en cada isodow.
- **[BAJO]** once con día ya pasado → va a la próxima semana (decisión explícita); si Nicolas prefiere "el
  día de esta semana aunque ya pasó", es un cambio de una línea, revisable.

## Verificación
- Tests: plantilla con 3 once en lun/mié/vie → asignar un distribuidor → 3 tareas con `start_date` en
  lun/mié/vie de la semana (no las 3 en today); once sin weekdays → today; once cuyo día ya pasó → semana
  siguiente. La impresión del distribuidor las muestra en los mismos días que la del admin. Build verde.

## Trazabilidad
- Refina ADR-0015 §3 (ancla de asignación) para once; relaciona ADR-0018 (siembra), ADR-0019 (weekdays),
  ADR-0025 (set_task_status on-demand para días futuros). No-core: `lib/actions/templates.ts`.
