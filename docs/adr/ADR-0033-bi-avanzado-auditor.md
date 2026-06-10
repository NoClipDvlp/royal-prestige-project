# ADR-0033 — BI avanzado del auditor: distribución + movimiento + heatmap (UI cohesiva)

- **Estado:** aceptado (dirección + alcance) · **la parte de datos la valida el Agente en preflight**
- **Fecha:** 2026-06-10
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (preflight pendiente)
- **¿Toca /core?:** PARCIAL → lo que no se derive de las funciones BI existentes (probablemente el cruce
  distribuidor×categoría del heatmap). El Agente acota en preflight; core con mi OK + `[CORE-APPROVED: ADR-0033]`.

## Contexto

El ranking del auditor tiene un toggle **rango/granularidad** (`ranking-view.tsx`) que aporta poco
("no hace nada" — Nicolas). Se reemplaza por un **BI avanzado de verdad**, con **UI ultra cómoda**.

## Decisión

Un **dashboard cohesivo del auditor** (reemplaza el selector inútil — Mandamiento 2), con tres lentes +
la carga futura ya existente, contado con storytelling por reglas:

### 1. Distribución del equipo (no un promedio)
Cumplimiento **distribuido** entre distribuidores: mediana + percentiles + **outliers destacados** (quién
muy por debajo/encima). Deriva de `compliance_ranking` (existe) → percentiles en server/cliente.
**Honestidad actuarial:** con **N chico** (pocos distribuidores) P10/P90 es poco robusto → el Agente adapta
la representación al N real (cuartiles/min-mediana-max si N es pequeño) y **declara** la base. No falsa precisión.

### 2. Movimiento (comparativa de períodos + alertas de caída)
Quién **subió/bajó** vs el período anterior, cuánto, y **en qué categoría** cae cada uno. Deriva de
`compliance_ranking` (3 rangos precalculados) + el delta que ya existe. Foco: deterioros accionables.

### 3. Heatmap distribuidor × categoría
Matriz: distribuidores (filas) × categorías (columnas), color por cumplimiento → dónde falla cada quien;
si **toda** una categoría está floja → problema de proceso, no de persona. **El cruce de dos dimensiones**
(distribuidor×categoría) probablemente NO lo da `compliance_breakdown` actual (una dimensión a la vez) →
**posible función BI nueva o N llamadas**; el Agente decide en preflight (core si es función nueva).

### 4. Carga futura (ya existe, ADR-0030)
Integrada/enlazada en el mismo dashboard (no duplicar): forecast por venir + drill.

### 5. UI ultra cómoda (no-core, autonomía del Agente)
Un solo dashboard, secciones/pestañas claras, **drill por clic**, sin recargas donde se pueda, insights por
reglas (NO LLM) que **citan el número** y cuentan la historia. Botón recargar (pedido (b)). Cero selectores
que no hagan nada.

## Qué se borró / acotó
- El toggle rango/granularidad inútil de `ranking-view` → reemplazado.
- "Dashboard infinito" → acotado a estas 3 lentes + carga. No más en esta vuelta.
- LLM en runtime → insights por reglas.

## Riesgos
- **[MEDIO]** Heatmap = cruce 2D → coste (N×M) + posible función core; ventana acotada, el Agente evalúa
  índice/derivación. **[MEDIO]** Percentiles con N chico → poco robustos; adaptar + declarar la base.
- **[BAJO]** Gate de rol (auditor/admin ven todos; distribuidor no entra aquí) → reusa el patrón ADR-0013.

## Verificación
- Tests: distribución/percentiles correctos sobre el ranking; movimiento coincide con el delta real;
  heatmap cuadra con los breakdown por dimensión; gate de rol; insights se disparan solo sobre umbrales.
  Build + harness verde.

## Trazabilidad
- Familia ADR-0013/0014/0030 (BI). Reemplaza el toggle de `ranking-view`. Core: solo el cruce del heatmap si
  hace falta. No-core: el dashboard + derivados + insights + UI. Marcador: `[CORE-APPROVED: ADR-0033]`.
