# ADR-0007 — Motor de tareas: materialización, recurrencia y edición

- **Estado:** aceptado
- **Fecha:** 2026-06-02
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — diseño solo-análisis
- **¿Toca /core?:** SÍ → `db/migrations/0003_tasks_engine.sql` y `lib/rls-policies/policies.sql`
  (ALTER `tasks_delete`). Aprobación humana: 2026-06-02 (Nicolas, vía Orquestador). Ejecución con
  **DISCIPLINA REFORZADA** (core-guard caído por billing, DEBT-0001 ítem 1).

## Contexto

El motor de tareas (SPEC §7) sobre el schema existente (`tasks`, `task_instances` ya en
`0000_init`). El 80% está soportado; falta la materialización de instancias y el modelado de la
edición de recurrentes. Es el corazón del producto (control de procesos = KPI), así que la
**integridad del KPI** manda sobre la conveniencia.

## Decisión

Score final: **4.7**.

### Materialización (solo el día de hoy)
- Un job **pg_cron** ejecuta `materialize_day(today)` diariamente: crea las `task_instances` DUE de
  HOY con `status=0`, idempotente (`on conflict (task_id,date) do nothing`). NO se materializa el
  futuro → las vistas semana/mes se **computan** desde `is_task_due`, no desde filas.
- **Trigger `AFTER INSERT on tasks`** crea la instancia de HOY si la tarea es due hoy (alta inmediata,
  "crear tarea < 1 min" sin esperar al job).
- **Las instancias las crea el sistema** (job + trigger, SECURITY DEFINER + `search_path=''`), NUNCA
  el distribuidor (ADR-0003: INSERT/DELETE de `task_instances` = admin/job). El distribuidor SOLO
  hace UPDATE de `status` y de overrides sobre su instancia (RLS self existente).
- **Corte de "día" = TZ fija única** del sistema, en constante `APP_TIMEZONE = 'America/Bogota'`
  (Nicolas, 2026-06-02). Descartado Vercel Cron (más superficie de ataque del endpoint service_role).

### Recurrencia — `is_task_due(task, D)`
`once` → D=`start_date`; `daily` → D≥`start_date`; `weekly` → `(D−start_date)` múltiplo de 7;
`monthly` → mismo día-de-mes que `start_date`, **clamp al último día del mes** en meses cortos
(día 31 → 30/28). Y D ≤ `recurrence_until` (si no null) y D ∉ `excluded_dates`.

### Edición estilo Google Calendar (3 scopes, todo dentro de la RLS self existente)
Añadidos de schema: `tasks.recurrence_until date null`, `tasks.excluded_dates date[] default '{}'`,
y columnas override NULLABLES en `task_instances` (`title`, `category_id`, `priority`, `time_slot`);
display = `coalesce(instance.x, task.x)`.
- **Toda la serie** → UPDATE `task` (afecta el contenido mostrado de pasadas y futuras; el `status`
  histórico se preserva — comportamiento estándar GCal).
- **Este y los siguientes** → split: `old.recurrence_until = D−1` + INSERT nueva `task` (nueva serie)
  desde D. Si D=hoy y la instancia ya existe → además overrides sobre la instancia de hoy.
- **Solo este día** → instancia existente (hoy/pasado): UPDATE overrides; futuro (sin instancia):
  `excluded_dates += D` + INSERT una `task` `once` (start_date=D) con el contenido editado.
Ninguna acción requiere dar INSERT/DELETE de `task_instances` al distribuidor → integridad KPI intacta.

### Borrado (soft-delete)
- `tasks.deleted_at timestamptz null`. "Borrar" = UPDATE `deleted_at` (cae bajo `tasks_update` self).
  El job/trigger ignora tareas con `deleted_at`. Las instancias pasadas se CONSERVAN (KPI histórico).
- **El filtrado de `deleted_at` vive en la capa de visualización** (listados/server actions), NO en la
  RLS → el motor de métricas sí ve las borradas para el histórico.
- **Se quita `distributor` de la policy `tasks_delete`** (queda solo admin) → el distribuidor no puede
  hard-delete (cascade) para inflar su KPI del período en curso. (Períodos cerrados ya están congelados
  en `metric_snapshots`.)

### Hardening
- **Trigger de inmutabilidad** de `owner_user_id`/`distribution_id` en `task_instances` ante UPDATE
  (el distribuidor no debe mutar el scope desnormalizado al editar status/overrides).
- `priority` efectivo para el KPI = `coalesce(instance.priority, task.priority)` → nota para el motor de métricas.

## Qué se borró / simplificó

- Materializar el futuro: descartado → edición de recurrentes a futuro se vuelve definicional.
- Vercel Cron: descartado (superficie de ataque) → pg_cron.
- Dar INSERT/DELETE de instancias al distribuidor: descartado (integridad KPI).
- Hard-delete por el distribuidor: descartado (KPI-gaming) → soft-delete.
- Filtrar `deleted_at` en RLS: descartado (el KPI necesita ver borradas) → filtrado en visualización.

## Riesgos detectados (insumo del Agente)

- **[ALTO] DELETE cascade borra historial de incumplimiento** → mitigado por soft-delete + quitar
  `distributor` de `tasks_delete` + snapshots congelados.
- **[MEDIO]** funciones SECURITY DEFINER → `search_path=''` obligatorio.
- **[MEDIO]** inmutabilidad de scope desnormalizado en instancias → trigger nuevo.
- **[MEDIO]** `excluded_dates` solo afecta materialización futura; instancias pasadas no se borran (KPI ok).
- **[BAJO]** pg_cron debe habilitarse en el proyecto Supabase (config; se suma a DEBT-0006).

## Verificación obligatoria (tests sobre Postgres real / harness)

- `materialize_day(today)` crea solo las DUE de hoy en `status=0`; idempotente; ignora soft-deleted.
- Trigger de alta: tarea due hoy → instancia de hoy creada al INSERT.
- `is_task_due` para once/daily/weekly/monthly (incl. clamp 29–31) + `recurrence_until` + `excluded_dates`.
- Los 3 scopes de edición producen el estado esperado SIN dar INSERT/DELETE de instancias al distribuidor.
- Soft-delete: tarea borrada no materializa nuevas instancias; sus instancias pasadas persisten; el
  distribuidor NO puede DELETE real (policy); admin sí.
- Trigger de inmutabilidad: distribuidor no puede cambiar owner/distribution de una instancia.
- Sin regresión: suites 20/21/22 verdes.

## Archivos core que toca la escritura

`db/migrations/0003_tasks_engine.sql` (columnas, `is_task_due`, `materialize_day`, pg_cron schedule,
trigger de alta, trigger de inmutabilidad, `deleted_at`), `lib/rls-policies/policies.sql` (ALTER
`tasks_delete` → solo admin). **No-core**: server actions (`createTask`/`updateTask`(scope)/
`softDeleteTask`/`setStatus`/`editOccurrence`) bajo RLS con la sesión del usuario; UI de alta rápida
(< 1 min). La parte core = disciplina reforzada.

## Trazabilidad

- Relaciona: `ADR-0003`, `docs/PROJECT_SPEC.md` §7, `docs/DATA_MODEL.md`
- Cierra: motor de tareas (SPEC §7). Habilita: métricas (KPI), calendario.
- Suma a DEBT-0006: habilitar pg_cron en el proyecto Supabase.
- Marcador de commit autorizado: `[CORE-APPROVED: ADR-0007]` (válido solo con estado = aceptado).
