# ADR-0025 — `set_task_status` con materialize-on-demand (toda tarea calificable)

- **Estado:** aceptado
- **Fecha:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (diagnóstico)
- **¿Toca /core?:** SÍ → migración (función DEFINER). **Revierte el candado de ERROR 4** (estado solo en
  días con instancia). Aprobación humana 2026-06-09. DISCIPLINA REFORZADA.

## Contexto

Regla de negocio (Nicolas): **cualquier** tarea —asignada o creada, cualquier día— se puede marcar
0/50/100. Causa raíz del bug: `setStatus` hace `UPDATE task_instances` por `(task_id, date)`; si la tarea
no tiene instancia materializada (día futuro o hueco del cron) → afecta 0 filas → no guarda → el optimistic
revierte ("se buguea"). Y `ti_insert` es admin-only por RLS, así que el distribuidor no puede crear la fila.

## Decisión

Función **`set_task_status(p_task_id uuid, p_date date, p_pct smallint)` `SECURITY DEFINER`**,
`set search_path=''`, que hace **upsert atómico** (`INSERT … ON CONFLICT (task_id, date) DO UPDATE`) de la
instancia con el estado, **gateada por propiedad EN la DB**: el caller debe ser el `owner_user_id` de la
task (`auth.uid()`) o admin. `setStatus` la llama por RPC.

- **Se rechaza la vía A** (upsert con service_role en `setStatus`): metería la llave maestra en la acción
  más frecuente del usuario → ensancha la superficie del service_role. El `DEFINER` con gate de ownership
  mantiene el service_role acotado a admin (mismo principio que `compliance_*`).
- **Revierte el candado de ERROR 4** (no-core, en la board): el toggle aparece en cualquier día.
- KPI intacto: `compliance_*` capa `d_end` a hoy (ADR-0021), así que marcar un día futuro no infla nada;
  cuando llegue ese día, ya está su estado.
- `status_pct` mantiene el CHECK {0,50,100}; `completed_at` se setea si pct=100.

## Riesgos
- **[MEDIO]** Gate de ownership mal hecho → un usuario marcaría instancias de otro (DEFINER bypassa RLS).
  Mitigación: gate `auth.uid() = task.owner_user_id OR app_current_role()='admin'` + tests de aislamiento.
- **[BAJO]** Upsert concurrente → `ON CONFLICT` lo hace idempotente.

## Verificación
- Tests: distribuidor marca tarea SIN instancia (futura) → se crea la instancia con el estado; marca de
  OTRO usuario → rechazada; pct fuera de {0,50,100} → rechazado; idempotente. Build verde. Aplicar en Supabase.

## Trazabilidad
- Revierte ERROR 4; relaciona ADR-0007 (motor), ADR-0021 (KPI capa a hoy). Core: migración (función DEFINER).
