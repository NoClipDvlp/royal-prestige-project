# ADR-0030 — Vista de auditor premium: carga futura + cumplimiento con drill + storytelling

- **Estado:** aceptado (dirección + alcance) · **las funciones BI las valida el Agente en preflight antes de core**
- **Fecha:** 2026-06-10
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (preflight pendiente)
- **¿Toca /core?:** SÍ probable → funciones BI nuevas (familia ADR-0013/0014, DEFINER + gate de rol).
  El Agente reporta alcance en preflight; core con mi OK + `[CORE-APPROVED: ADR-0030]`. DISCIPLINA REFORZADA.

## Contexto

La vista de auditor hoy es el KPI de cumplimiento simple (ranking + sparkline, ADR-0013/0014). Nicolas pide
algo **más profundo, premium e interactivo** para análisis: ver la **carga por venir** ("cuántas tareas
tiene cada distribuidor para mañana", "cuántas por distribución"), desgloses por **categoría** y
**distribución**, con **storytelling**. Si sirve, replicar al distribuidor en su propio scope.

## Decisión

### 1. Dos familias de métrica, separadas (rigor)
- **CUMPLIMIENTO (pasado):** lo existente, capado a hoy (ADR-0021). Se enriquece con **drill-down**:
  por **distribución → distribuidor → categoría** (no solo el global). Reusa/extiende `compliance_breakdown`
  (el Agente verifica qué ya existe vs qué falta).
- **CARGA / PLANIFICACIÓN (futuro):** métrica **nueva, descriptiva** — cuenta tareas **agendadas** (vía
  `is_task_due`) en una ventana futura (mañana / próxima semana), agregada por **distribuidor**,
  **distribución** y **categoría**. **No es cumplimiento** → no infla ni toca el KPI; nace separada.

### 2. Storytelling = insights por reglas (NO LLM en runtime)
Capa que deriva frases-insight de los datos por umbrales/comparativas: outlier de carga ("Distribución X
tiene ~40% más carga que la media para la próxima semana"), caída de cumplimiento por categoría, distribuidor
sobre/sub-cargado. Calculado, no generado por modelo. Presentación premium (jerarquía visual, no un dump de
tablas).

### 3. Interactividad (no-core)
Filtros (semana, distribución, categoría), comparativas lado a lado, drill-down por clic, hover con detalle,
tendencia (reusa la sparkline de ADR-0014). Sin recargar la página donde se pueda.

### 4. Distribuidor (self-scope) — incluido
La misma vista de **carga futura + desglose por categoría** para el distribuidor, limitada a **lo suyo**
(self), sin ver a otros. Reusa las funciones con el gate de rol ya existente (distribuidor → solo su fila).

### 5. Gate de rol (línea dura)
Las funciones nuevas siguen el patrón DEFINER de ADR-0013: auditor/admin ven agregados de todos; distribuidor
solo lo suyo; jd/seller según su scope. El auditor ve **agregados**, no necesariamente el detalle de cada
tarea individual (a confirmar en preflight según lo que ya exponen las funciones).

## Qué se borró / acotó (Mandamiento 1-3)
- **Dashboards infinitos** → fuera. Set acotado: carga futura (3 desgloses) + cumplimiento con drill +
  insights. Nada más en esta vuelta.
- **LLM/IA en runtime para el storytelling** → descartado: insights por reglas.
- **Métricas de "cumplimiento futuro"** → no existen por definición (ADR-0021); se sustituyen por carga.

## Riesgos
- **[MEDIO]** Forward-looking sobre `is_task_due` puede ser caro (N distribuidores × días × recurrencia) →
  el Agente acota la ventana (p.ej. ≤14 días), evalúa índices y si conviene materializar/cachear. Reporta.
- **[MEDIO]** Gate de rol mal puesto → un distribuidor vería carga ajena. Tests de aislamiento por rol.
- **[BAJO]** Insights por umbrales mal calibrados → frases triviales/ruidosas; umbrales conservadores + que
  el insight cite el número (no adjetivos vacíos).

## Verificación
- Tests: carga futura agrega correcto por distribuidor/distribución/categoría; gate (distribuidor solo lo
  suyo; auditor/admin todos); cumplimiento drill coincide con el global; ventana futura no toca KPI histórico;
  insights se disparan solo sobre los umbrales. Build verde + harness por función.

## Ratificación tras preflight + aprobación humana (2026-06-10)

Preflight del Agente + OK de Nicolas. Firmas BI aprobadas `[CORE-APPROVED: ADR-0030]`:
- **`task_load_forecast(d_start, d_end, dimension, p_user, p_distribution)`** — NUEVA, descriptiva (NO
  cumplimiento): cuenta `is_task_due` en ventana futura ≤14d, agregada por distribuidor | distribution |
  category. Gate DEFINER (auditor/admin = todos; distribuidor = solo su fila). Índice
  `tasks(distribution_id) where deleted_at is null`. Sin cache en v1 (org pequeña; snapshot diario = DEBT si
  crece). No toca el KPI.
- **`compliance_breakdown` extendido** con `dimension='distribution'` + `p_distribution` opcional para el
  drill distribución→distribuidor→categoría (reusa el cuerpo existente).
- La **vista premium real** (auditor + variante distribuidor + la vista viva de tareas del distribuidor para
  supervisores que quedó pendiente de ADR-0031) se construye tras estas firmas, sin mock desechable.
- Storytelling = insights por reglas/umbrales (NO LLM); tests de aislamiento por rol en el harness.

## Trazabilidad
- Familia de ADR-0013 (motor BI), ADR-0014 (sparkline), ADR-0021 (KPI capado a hoy → por qué "carga" ≠
  "cumplimiento"), ADR-0031 (vista viva supervisor). Core: funciones BI nuevas. No-core: vista premium
  auditor + variante distribuidor. Marcador: `[CORE-APPROVED: ADR-0030]`.
