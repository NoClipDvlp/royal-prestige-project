# ADR-0026 — Revocar EXECUTE de `materialize_day` (cierre de hueco cross-tenant)

- **Estado:** aceptado
- **Fecha:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (revisión adversarial)
- **¿Toca /core?:** SÍ → migración (revoke). Aprobación humana 2026-06-09. DISCIPLINA REFORZADA. **CRÍTICO (seguridad).**

## Contexto

La revisión adversarial de ADR-0025 destapó un **hueco de seguridad pre-existente** (desde `0003_tasks_engine.sql`):
`public.materialize_day(date)` es `SECURITY DEFINER` (corre como owner, bypassa RLS) y **no tiene
`revoke`** → queda con `EXECUTE` a `PUBLIC`. Cualquier usuario `authenticated` puede invocarla por RPC
(PostgREST) y:
- **Sembrar instancias de TODA la organización** (cross-tenant) — no solo las suyas.
- **Degradar el KPI ajeno**: las instancias nacen `status_pct=0`; sembrarlas en días pasados mete
  "no-hechas" en el histórico de otros distribuidores.

Ningún server action la usa; solo la llama el cron de `pg_cron` (como owner). La superficie de ataque es innecesaria.

## Decisión

Migración nueva (+ consolidado): **revocar EXECUTE de `materialize_day` a `public`/`authenticated`**.

```sql
revoke execute on function public.materialize_day(date) from public, authenticated;
```

El cron (pg_cron) la sigue ejecutando como su owner/service_role → la materialización diaria no se afecta.
Es el mismo patrón que ADR-0025 ya aplica a `set_task_status` (revoke public, grant solo a quien debe).

## Riesgos
- **[BAJO]** Si algún código futuro necesitara llamarla desde la app, habría que un wrapper gateado
  (como `set_task_status`). Hoy nadie la llama → revoke seguro.

## Verificación
- Test: un `authenticated` que invoque `materialize_day` → permiso denegado; el cron sigue materializando.
  Consolidado idempotente. Aplicar en Supabase.

## Trazabilidad
- Relaciona `0003_tasks_engine` (origen), ADR-0025 (mismo patrón de revoke). Core: migración (revoke).
