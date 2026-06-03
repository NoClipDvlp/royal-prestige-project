# ADR-0012 — Motor de métricas: cumplimiento en vivo + ranking del auditor

- **Estado:** aceptado
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — análisis solo-lectura (policies verificadas archivo:línea)
- **¿Toca /core?:** SÍ → `db/migrations/0005_metrics.sql` (3 objetos SQL: helper + 2 funciones).
  Aprobación humana: 2026-06-03 (Nicolas, vía AskUserQuestion). Ejecución con **DISCIPLINA
  REFORZADA** (core-guard caído, DEBT-0001 ítem 1).

## Contexto

El hito Métricas (SPEC §8) pide: % de cumplimiento (día/semana/mes) ponderado por prioridad,
conteos hechas/medias/no-hechas, y ranking comparativo entre distribuidores para auditor/admin.

Hallazgo del análisis del Agente, **verificado contra las policies reales**:

- **Self-metrics del distribuidor → ya viable sin core.** La RLS self de `task_instances`/`tasks`
  (`ti_select`, `tasks_select`) ya da al distribuidor lectura de lo propio.
- **Ranking del auditor en vivo → NO tiene ruta de datos.** El auditor **no** lee
  `task_instances`/`tasks` (sus policies son admin-o-self). El ranking se diseñó originalmente
  sobre `metric_snapshots` (0001:33), que en este hito quedan **diferidos** (decisión de alcance:
  el congelado por snapshots es optimización para volumen que aún no existe).

Dar RLS de lectura al auditor sobre `task_instances` reabriría PII de filas (títulos/horas) →
regresión de ADR-0005. Se descarta. La salida limpia es una **función agregada** que devuelve
solo números + ids.

## Decisión

### 1. Snapshots congelados — DIFERIDOS (fuera de este hito)
El motor de `metric_snapshots` (pg_cron + write + `payload`) se difiere hasta haber volumen
real. El cálculo en vivo sobre `task_instances` (índice `idx_ti_owner_date` ya existe) es trivial
a este volumen y es **la misma fórmula** que un futuro snapshot congelaría → no es trabajo tirado.

### 2. Tres objetos SQL — defensa en profundidad sobre DRY (`db/migrations/0005`)
Se rechaza la opción de **una sola** función `DEFINER` (self+ranking) pese a su ventaja DRY: haría
que el aislamiento del distribuidor dependa de un `WHERE` interno en una función que *bypassa* RLS
(si el gate falla → fuga cross-distribución total). Se eligen **dos funciones + un helper**:

- **`priority_weight(p task_priority) returns int`** — `IMMUTABLE`. Única definición del peso:
  `high=3, medium=2, low=1`. Mata el drift de fórmula.
- **`compliance_self(d_start date, d_end date)`** — **`SECURITY INVOKER`**. La RLS de Postgres
  contiene al distribuidor a sus filas aunque hubiera un bug. **Reemplaza `summarizeWeek` (TS,
  `week.ts`)** → única fórmula, en SQL.
- **`compliance_ranking(d_start date, d_end date)`** — **`SECURITY DEFINER`**, `set search_path=''`,
  **gate de rol interno** (`app_current_role() in ('admin','auditor')`, si no → 0 filas). Devuelve
  **solo agregados + ids** (cero títulos/horas → preserva la frontera PII de ADR-0005).

### 3. Fórmula del % ponderado
Como `status_pct ∈ {0,50,100}`, el cumplimiento ponderado = media ponderada de `status_pct`:

```
compliance_pct = round( Σ(w · status_pct) / NULLIF(Σ(w), 0) )
  w = priority_weight( coalesce(ti.priority, t.priority) )   -- override instancia→task (ADR-0007)
```

`NULLIF` → un usuario **sin tareas en el rango** devuelve `NULL`, que la UI muestra como
**"sin datos"**, NUNCA 0% (un 0% falso penalizaría a quien no tenía tareas).

### 4. Tareas borradas — CUENTAN (Nicolas, 2026-06-03)
El KPI cuenta las instancias de tareas soft-deleted (ADR-0007). Anti-gaming: una tarea en 0% que
luego se borra **sigue penalizando** → no se puede inflar el KPI borrando las no-hechas. El cálculo
**NO** filtra `deleted_at`.

### 5. Ranking — AMBOS niveles (Nicolas, 2026-06-03)
- **Por distribuidor** (usuario `role='distributor'`): una fila por usuario.
- **Por distribución** (rollup): **agregación sobre todas las instancias** de los miembros de la
  distribución — `Σ(w·status_pct)/Σ(w)` sobre el conjunto, **NO promedio de promedios** (que
  sesgaría hacia usuarios con pocas tareas). Población rankeada = `role='distributor'`
  (admin/auditor/jd/seller excluidos de las filas). Nombres vía `users_labels` (auditor-safe).

### 6. Corte de rango
`d_end` se capa a `app_today()` (no penalizar días futuros del mes en curso) — espejo de
`summarizeWeek`. La app pasa los rangos: día = hoy/hoy; semana = lunes/hoy; mes = día-1/hoy.

## Qué se borró / simplificó

- **Snapshots congelados** (pg_cron + write): diferidos por volumen.
- **Configurabilidad del peso**: el peso es fijo 1/2/3 (nadie pidió hacerlo ajustable).
- **Self-metrics en TS** (`summarizeWeek`): se reemplaza por `compliance_self` → mata la
  duplicación de fórmula TS↔SQL.

## Riesgos

- **[ALTO → mitigado]** RLS de lectura al auditor reabriría PII (ADR-0005). **Descartado**: se usa
  función agregada, no RLS.
- **[MEDIO]** `compliance_ranking` mal gateada filtraría KPI entre distribuidores. Mitigación:
  `search_path=''` + gate `app_current_role()` + **suite de tests de aislamiento dura** + solo
  agregados (ni el peor caso expone PII de filas). El self ya NO depende de DEFINER.
- **[BAJO]** Sin índice `date`-líder, el agregado global del auditor degrada a escala. Mitigado:
  volumen diferido. Follow-up: `task_instances(date, distribution_id)` cuando haya volumen.
- **[BAJO]** Días no materializados (cron falló) subcuentan el KPI vivo (operacional, fuera de scope).

## Verificación obligatoria

- Tests de aislamiento: distribuidor solo ve su propio KPI (self); auditor/admin reciben agregados
  de todos; un distribuidor invocando `compliance_ranking` recibe 0 filas; cero PII de fila en la
  salida del ranking.
- Fórmula: paridad con casos conocidos (p.ej. una high=100 + una low=0 → 100·3/(3+1)=75); rollup a
  distribución = agregación sobre instancias (no promedio de promedios); `Σw=0` → `NULL` (no 0%).
- `compliance_self` produce el mismo resultado que el `summarizeWeek` que reemplaza (sin regresión home).
- Build verde. Aplicar `0005` en Supabase (Nicolas).

## Trazabilidad

- Relaciona: `ADR-0005` (PII/auditor labels), `ADR-0007` (motor/soft-delete), `ADR-0008`
  (`app_current_role`), `ADR-0009` (UI por rol — desbloquea nav auditor), `ADR-0011`.
- Archivos core: `db/migrations/0005_metrics.sql`.
- No-core (sub-hito siguiente): cableado home (día/semana/mes desde `compliance_self`), pantalla de
  ranking del auditor (compacta/ampliada), gráficos.
- Marcador: `[CORE-APPROVED: ADR-0012]` (válido solo con estado = aceptado).
