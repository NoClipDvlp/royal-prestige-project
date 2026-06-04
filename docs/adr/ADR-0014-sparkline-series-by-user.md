# ADR-0014 — Sparkline por distribuidor: `compliance_series_by_user`

- **Estado:** aceptado
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano)
- **Redactó:** Orquestador (Claude Cowork) · **Insumo:** Agente (análisis solo-lectura)
- **¿Toca /core?:** SÍ → `db/migrations/0009_series_by_user.sql` (1 función + grant).
  Aprobación humana 2026-06-03. **DISCIPLINA REFORZADA**. Familia de ADR-0013 (motor BI).
  (Nº de migración = 0009: 0007 quedó como hueco intencional; 0008 es plantillas/ADR-0015. Las migraciones
  son append-only — el número refleja CUÁNDO se crea, no la prioridad de feature.)

## Contexto

Para que el auditor vea la tendencia de cada distribuidor sin un click (observación de Nicolas:
"menos clicks, mejor productividad"), se añade una mini-sparkline en cada fila del ranking.
`compliance_series(p_user=null)` agrega TODOS en una sola serie → no sirve para una línea por
distribuidor; se necesita la serie por `user_id`.

## Decisión

Se rechaza la **Opción A** (N llamadas a `compliance_series` en `Promise.all`): es un N+1 que satura
el pool de conexiones justo donde N crece (el auditor rankea todas las distribuciones). Se elige la
**Opción B**: una RPC nueva.

- **`compliance_series_by_user(d_start date, d_end date, bucket text)`** → `SECURITY DEFINER`,
  `set search_path=''`, gate admin/auditor idéntico a `compliance_series` (ADR-0013), whitelist de
  `bucket`. `returns table(user_id uuid, bucket_start date, total int, done int, half int, undone int,
  compliance_pct int)` agrupado por `(owner_user_id, bucket)`. Población `role='distributor'`. **Solo
  agregados + `user_id`** (nombres ya vienen de `users_labels`; cero títulos). 1 round-trip, O(N×buckets).
- **Bucket del sparkline:** **semanal fijo, últimas ~8–12 semanas**, independiente del toggle de rango
  del pct (que sigue mandando el número grande). Configurarlo por fila = sobre-ingeniería.
- **Cobertura:** todas las filas del ranking (B trae todas en una query). Si N creciera mucho, el
  render se hace lazy — refinamiento, no v1.

## Qué se borró / simplificó

- Opción A (N+1) → descartada salvo como puente, que no se usa.
- Bucket configurable por fila / ligado al toggle → fijo semanal.
- Acotar a top-N → innecesario con B (1 query).

## Riesgos

- **[BAJO]** Mismo gap de índice `date`-líder que el agregado auditor-all (diferido); a ≤12 buckets × N
  sobre ~12 semanas aguanta. Follow-up de escala junto con snapshots.
- **[BAJO]** Render de N sparklines → lazy si N crece (no v1).

## Verificación

- Tests: gate (distribuidor → 0 filas); admin/auditor → series por usuario; bucketeo semanal correcto;
  cero títulos en la salida; whitelist de `bucket`. Build verde. Aplicar `0009` en Supabase.

## Trazabilidad

- Amplía **ADR-0013** (motor BI). Reusa `priority_weight`, patrón gate DEFINER, `users_labels`.
- Core: `db/migrations/0009_series_by_user.sql`. No-core: sparkline SVG inline en `ranking-view.tsx`.
- Marcador: `[CORE-APPROVED: ADR-0014]`.
