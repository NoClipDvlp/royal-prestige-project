# ADR-0031 — Consistencia de lectura entre paneles (supervisión = estado real actual)

- **Estado:** aceptado (principio) · **la causa raíz + el fix los trae el Agente en diagnóstico**
- **Fecha:** 2026-06-10
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (diagnóstico pendiente)
- **¿Toca /core?:** A DETERMINAR por el diagnóstico (caché/queries = no-core; snapshots/funciones = core).
  Si toca core → mi OK + marcador. DISCIPLINA REFORZADA si aplica.

## Contexto

En el ciclo constante de features/UX/bugfixes, la **propagación de estado entre paneles** se quedó atrás.
Síntoma reportado por Nicolas: cuando el **distribuidor edita una tarea**, el cambio **NO se refleja** en el
**panel de admin** ni en el de **auditor** — siguen viendo la tarea en su **estado inicial** (el de cuando se
creó/asignó). Posiblemente también ocurra dentro del propio panel del distribuidor. Resultado: los
supervisores deciden sobre **datos falsos**. Es un bug de consistencia, **crítico**.

## Decisión (principio de producto)

**Todo panel que muestre el estado de una tarea lee la VERDAD ACTUAL de las tareas reales** (`tasks` +
`task_instances`) con la RLS del rol — **una sola fuente de verdad**. Queda **prohibido**, para representar el
estado vivo:
- leer la **definición original** (`template_items` / snapshot de asignación) como si fuera el estado actual;
- servir **caché sin revalidar** tras una mutación;
- mostrar **`metric_snapshots`** u otra proyección desactualizada donde se espera el dato en vivo.

Si el distribuidor edita o borra su tarea (autonomía total, ADR-0015 §1), **admin y auditor ven ese cambio**.
La plantilla es la *fábrica*; la supervisión es sobre las *tareas vivas*, no sobre la intención original.

**No hay conflicto con ADR-0015:** ese ADR da autonomía al distribuidor sobre sus tareas; este ADR dice que
la supervisión refleje esa realidad. Son la misma verdad vista desde otro rol.

## Diagnóstico que debe traer el Agente (antes del fix)
Identificar **de dónde lee cada panel** (admin, auditor, distribuidor) y **por qué no propaga**. Candidatos:
1. **Caché de Next** (`cache()` / segmentos sin `revalidatePath`/`revalidateTag` tras la mutación).
2. **Lectura de la definición** (la vista de admin muestra `template_items`/start_date original en vez de la
   `task` materializada y su `task_instances`).
3. **Snapshots BI** (`metric_snapshots`) servidos donde se espera el estado en vivo.
Reportar la causa real (puede haber más de una por panel) y el fix mínimo. Si el fix es caché/queries → no-core
y lo ejecuta; si toca cómo se generan snapshots/funciones → preflight para mi OK.

## Alcance conexo (Nicolas)
El **distribuidor** debe ver además sus **tareas pendientes del día siguiente** y una **vista semanal premium
orientada a análisis BI** — esto es la **variante distribuidor de ADR-0030** (carga futura + desglose). Se
trata junto a #5; este ADR garantiza que esa vista lea el estado real, no uno congelado.

## Riesgos
- **[ALTO]** Si la causa es caché agresiva, un fix incompleto deja paneles parcialmente obsoletos → el Agente
  cubre TODOS los puntos de lectura (admin/auditor/distribuidor), no solo el reportado. Test por panel.
- **[MEDIO]** Revalidación excesiva podría degradar performance → invalidar por tag/path acotado, no todo.
- **[BAJO]** Si algún panel mostraba la definición a propósito, se documenta el cambio (supervisión = realidad).

## Verificación
- Test E2E por rol: el distribuidor edita/borra una tarea → admin y auditor ven el cambio sin recargar manual
  (o tras la revalidación esperada); el KPI/breakdown refleja el estado vivo; ningún panel muestra el estado
  inicial congelado. Build verde.

## Trazabilidad
- Relaciona ADR-0015 (autonomía del distribuidor = la realidad a reflejar), ADR-0013/0021 (BI/snapshots),
  ADR-0030 (vista premium; la variante distribuidor entra aquí). Core: según diagnóstico. No-core: caché +
  queries de los paneles.
