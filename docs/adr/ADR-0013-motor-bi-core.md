# ADR-0013 — Motor BI: serie temporal + desglose, auditoría agregada

- **Estado:** aceptado
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — análisis solo-lectura (schema verificado)
- **¿Toca /core?:** SÍ → `db/migrations/0006_bi.sql` (2 funciones + grants). Aprobación humana:
  2026-06-03 (Nicolas, vía AskUserQuestion). **DISCIPLINA REFORZADA** (core-guard caído, DEBT-0001).

## Contexto

Tras validar el cálculo base en vivo (ADR-0012, el ranking real dio 83% correcto), se habilita el
BI. Nicolas pidió métricas "enfocadas a BI, no tableros basura": tendencia temporal, drill-down por
categoría/prioridad, comparativa ampliada y detalle por distribuidor. Criterio rector: **toda vista
de BI responde una pregunta que el auditor accione**, no métricas-vanidad.

## Decisión

### 1. Alcance: 4 dimensiones → 2 superficies (no-core, sub-hito siguiente)
Las 4 dimensiones pedidas se entregan en **dos** superficies (se borran las vistas standalone de
tendencia y drill-down por redundantes):

- **Perfil del distribuidor** = el expediente que el **auditor** abre: tendencia temporal + desglose
  por categoría/prioridad de UN distribuidor (`p_user` dado). Absorbe "tendencia" + "drill-down".
- **Ranking ampliado** = la comparativa de todos (`p_user = null`), extendiendo el `RankingView`
  existente.

### 2. BI es herramienta de AUDITORÍA → 2 funciones DEFINER, auditor/admin-only
Se rechaza dar BI al distribuidor en v1 (Mandamiento 2): el distribuidor ya tiene su `ComplianceCard`
(día/semana/mes) del home, que es `compliance_self` **INVOKER** (RLS self, ADR-0012) — intacto. El
perfil-BI es del auditor. Por tanto BI = 2 funciones **`SECURITY DEFINER`** con **gate idéntico a
`compliance_ranking`** (ADR-0012): admin/auditor → datos; distribuidor → 0 filas.

**Esto resuelve la tensión defensa-en-profundidad por construcción, no por sacrificio:** como el
distribuidor **no invoca** estas RPCs, su aislamiento NO depende de ellas (sigue protegido por la RLS
self vía `compliance_self`). No se necesitan 4 funciones (self INVOKER + all DEFINER).

- **`compliance_series(d_start, d_end, bucket text, p_user uuid default null)`** → cumplimiento por
  bucket (`day`/`week`/`month`). `p_user` dado = serie de ese distribuidor (perfil); `null` = serie
  agregada de todos (ranking-ampliado).
- **`compliance_breakdown(d_start, d_end, dimension text, p_user uuid default null)`** → desglose por
  `category` o `priority` (un parámetro `dimension`, no dos funciones — mismo gate, misma seguridad).

Ambas: `set search_path=''`, gate `app_current_role() in ('admin','auditor')` (si no → 0 filas),
población `role='distributor'`, devuelven **solo agregados** (bucket/key + label + counts + pct).

### 3. Bucketeo TZ-safe
`task_instances.date` ya es la fecha-calendario de Bogotá (la materializa `materialize_day(app_today())`),
así que el bucket es `date_trunc(bucket, ti.date)::date` **sin conversión de zona**. El único uso de TZ
es el capado `least(d_end, app_today())`. `date_trunc('week', …)` empieza lunes → casa con
`weekStartMonday`. `bucket` y `dimension` se validan por **whitelist** (nunca `format` dinámico con el
input → evita inyección).

### 4. Categoría efectiva + nombre
`key = coalesce(ti.category_id, t.category_id)` (override instancia→task, ADR-0007); `null` →
bucket **"Sin categoría"**. El **nombre** lo resuelve la RPC DEFINER (join a `task_categories`) porque
el **auditor no lee `task_categories`** (`cat_select` = admin/distributor). El nombre de categoría es
**label**, no PII de usuario → aceptable devolverlo.

### 5. Drill-down = SOLO agregados (Nicolas, 2026-06-03) — ADR-0005 intacto
El auditor ve el desglose por categoría/prioridad (el patrón de incumplimiento), **NUNCA los títulos**
de las tareas. Mostrar títulos ajenos rompería la frontera label-only de ADR-0005 que aísla a los
distribuidores. El breakdown agregado responde "¿dónde falla?" sin exponer la operación del
distribuidor. **No se crea una 3ª RPC de títulos.** (Si en el futuro se decide exponer títulos al
auditor, es un ensanche deliberado de ADR-0005 → ADR nuevo + sign-off.)

### 6. Índice — diferido
El perfil (`p_user` dado, filtra por owner) ya está cubierto por `idx_ti_owner_date`. El agregado
auditor-all (`p_user=null`, filtra solo por rango) no tiene índice `date`-líder → a bajo volumen
(snapshots diferidos = pocos miles de filas) es despreciable. **No se añade índice** (follow-up de
escala, coherente con diferir snapshots). Disparador futuro: `task_instances(date)` o
`(date, distribution_id)` cuando haya volumen.

## Qué se borró / simplificó

- **Vistas standalone** de tendencia y drill-down → absorbidas en el perfil del distribuidor.
- **BI para el distribuidor** en v1 → usa su `ComplianceCard` existente (no toca las RPCs DEFINER).
- **4 funciones** (self INVOKER + all DEFINER) → **2** (BI es auditor-only).
- **3ª RPC de títulos** → no existe (drill-down agregado).
- **Índice `date`-líder** → diferido.

## Riesgos

- **[MEDIO]** RPC DEFINER mal gateada filtra series/breakdown entre distribuidores. Mitigación:
  `search_path=''` + gate `app_current_role()` + `target` validado + **tests de aislamiento duros**
  (distribuidor → 0 filas; auditor agregados; cross-distribución). Mismo patrón ya probado en 0012.
- **[BAJO → bloqueado]** Títulos al auditor = regresión ADR-0005 → descartado por decisión (§5).
- **[BAJO]** Sin índice `date`-líder, el agregado auditor-all degrada a escala. Mitigado: volumen diferido.
- **[BAJO]** `bucket`/`dimension` sin validar → error/inyección. Mitigación: whitelist (§3).

## Verificación obligatoria

- Tests de aislamiento: distribuidor invocando `compliance_series`/`compliance_breakdown` → 0 filas;
  auditor/admin → agregados; `p_user` dado = solo ese distribuidor (perfil); cero títulos/horas en la salida.
- Bucketeo: `day`/`week`/`month` correctos; semana = lunes; capado `d_end` futuro a `app_today()`.
- Breakdown: `priority` agrupa por prioridad efectiva; `category` por categoría efectiva con
  `null → "Sin categoría"` y nombre resuelto; `bucket`/`dimension` fuera de whitelist → rechazado.
- Σw=0 → `compliance_pct NULL` (no 0%). Build verde. Aplicar `0006` en Supabase (Nicolas).

## Trazabilidad

- Relaciona: `ADR-0005` (PII/label-only), `ADR-0007` (overrides/soft-delete), `ADR-0008`
  (`app_current_role`), `ADR-0012` (motor métricas — `priority_weight`, patrón gate).
- Archivos core: `db/migrations/0006_bi.sql`.
- No-core (sub-hito siguiente): pantalla perfil del distribuidor (tendencia + breakdown desde las
  RPCs), ranking ampliado (tabla ordenable). Vista compacta primero; gráficos si aportan.
- Marcador: `[CORE-APPROVED: ADR-0013]` (válido solo con estado = aceptado).
