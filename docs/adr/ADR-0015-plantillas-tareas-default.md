# ADR-0015 — Plantillas de tareas (tareas default): fábrica + asignación

- **Estado:** aceptado
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork) · **Insumo técnico:** Agente (análisis solo-lectura)
- **¿Toca /core?:** SÍ → `db/migrations/0008_templates.sql` (3 tablas + ALTER tasks + RLS).
  Aprobación humana 2026-06-03. **DISCIPLINA REFORZADA** (core-guard caído, DEBT-0001).

## Contexto

El admin necesita estandarizar el proceso de los distribuidores: definir **plantillas de tareas
default** y asignarlas. Es el corazón del "control de procesos". El modelo ya soporta tareas asignadas
por superior (`tasks.origin='superior'`, `tasks.assigned_by_user_id`, `tasks_insert` admite el branch
admin) y el motor (is_task_due / materialize_day / trigger de alta) materializa recurrencia sin lógica
nueva. **El vínculo a plantilla es lo nuevo.**

## Decisión

### 1. Modelo: la plantilla es una FÁBRICA de tareas (Nicolas, 2026-06-03)
- **Asignar una plantilla AÑADE tareas** al distribuidor (se suman a las que ya tiene; NO reemplaza,
  NO fusiona). Cada tarea materializada queda **vinculada** a su plantilla (`template_id`,
  `template_item_id`).
- **Las tareas asignadas son del distribuidor**: las edita, modifica y borra **libremente** en su
  panel, como cualquier tarea propia. Plena autonomía.

### 2. Tablas (mínimo)
- **`task_templates`** (GLOBAL): `id, name, description?, created_by, created_at, updated_at, deleted_at`.
  Scope **global** (proceso estándar de marca, reusable entre distribuciones; el admin las gestiona todas).
- **`template_items`**: `id, template_id fk, title, category_id?, priority, recurrence, time_slot?,
  duration_minutes?` — la **forma** de cada tarea. **Sin `start_date`** (el ancla la pone la asignación).
- **`template_assignments`**: `template_id, user_id, assigned_by, assigned_at` — el conjunto de
  asignados (semántica "ya-asignados vs futuras"; evita re-asignar a ciegas; registro explícito que
  sobrevive aunque las tareas se borren).
- **`ALTER tasks`**: `template_id?`, `template_item_id?` (nullable; las tareas normales no los usan).

### 3. Materialización (reusa el motor, cero lógica nueva)
Asignar = **bulk INSERT** en `tasks` (una por `template_item`): `owner=distribuidor`,
`distribution=la suya`, `origin='superior'`, `assigned_by_user_id=admin`, `template_id`,
`template_item_id`, `start_date = fecha de asignación`, + recurrence/time_slot/priority/category/
duration del item. El trigger de alta + pg_cron + is_task_due hacen el resto (idéntico a crear tareas).

### 4. Propagación al editar la plantilla — opt-in, NO destructiva
Reusa el patrón del popup de recurrentes (ADR-0007), **binario en v1**: al editar, el admin elige
**"aplicar a asignados existentes"** o **"solo a futuras asignaciones"**.
- **Respeta al distribuidor** (consecuencia del modelo §1): la propagación **NO pisa** las tareas que
  el distribuidor editó o borró — son suyas. Solo actualiza las tareas vinculadas **intactas**.
  *El mecanismo de detección de "intacta vs editada" lo afina el Agente en pre-flight (flag de
  customización vs comparación con el item); la DECISIÓN de producto es: no-destructiva.*
- **"Solo futuras"** = solo cambia el `template_item`; las tareas ya asignadas quedan intactas.
- **Línea dura:** la propagación SOLO toca la **definición** de `tasks`. **Nunca** `task_instances`
  (status/KPI histórico intacto, ADR-0007).

### 5. Alcance del editar (v1)
Solo **editar campos** de items existentes. **Añadir/quitar items** → fase 2 (implica crear/soft-borrar
tareas en los asignados → atomicidad multi-statement, más complejo).

### 6. Unassign = soft-detach
Desasignar = **soft-delete** de las tareas de la plantilla (`deleted_at`, ADR-0007): corta el futuro,
**conserva las instancias pasadas** (KPI intacto). El registro en `template_assignments` se marca inactivo.

### 7. Advertencias de apilado (advisory, no bloqueantes)
Permitido asignar varias plantillas / re-asignar. Al asignar, query advisory detecta:
- **Duplicado**: mismo `title + time_slot + recurrence` activo para ese distribuidor.
- **Solape**: rangos `[time_slot, time_slot+duration)` que se cruzan en la misma recurrencia.
El admin confirma. Ninguna es bloqueante en v1.

### 8. RLS y atomicidad
- **RLS**: admin CRUD de plantillas; el **distribuidor NO ve las plantillas** — opera sus tareas
  materializadas vía la RLS de `tasks`/`task_instances` **existente** (owner=self, ya cubre las
  columnas nuevas). El **auditor no lee plantillas** en v1.
- **Asignar/propagar** = server actions con la sesión admin (la RLS admin ya permite insert/update de
  cualquier task) → **no-core** en v1. La **atomicidad del bulk multi-paso** queda como **deuda**
  (patrón DEBT-0007); un RPC `SECURITY DEFINER` atómico es hardening posterior.

## Qué se borró / simplificó

- Propagación destructiva (overwrite de ediciones) → descartada: el distribuidor es autónomo.
- Añadir/quitar items en la propagación → fase 2.
- Propagación granular "elige a cuáles distribuidores" → binario v1.
- Vínculo vivo forzado → la plantilla añade y suelta; la propagación es opt-in y no-destructiva.
- Auditor leyendo plantillas → fuera de v1.

## Riesgos

- **[ALTO]** Propagación que toque `task_instances.status` rompería el KPI histórico → **línea dura**:
  la propagación SOLO actualiza la definición de `tasks`, nunca instancias.
- **[MEDIO]** Atomicidad del bulk asignar/propagar (multi-statement) → estado parcial; RPC atómico como
  hardening posterior (deuda declarada).
- **[MEDIO]** Detección "intacta vs editada" mal hecha pisaría ediciones del distribuidor → el mecanismo
  (pre-flight del Agente) debe ser conservador: ante duda, NO pisar.
- **[BAJO]** Apilado sin aviso → solapes confusos; mitigado por la detección advisory.

## Verificación obligatoria

- Tests: asignar añade N tareas vinculadas (no reemplaza); el distribuidor puede editar/borrar sus
  tareas materializadas; propagar "a asignados" actualiza solo intactas y NO toca instancias/status;
  propagar "solo futuras" no toca asignadas; unassign soft-detach conserva instancias pasadas; RLS
  (distribuidor no ve plantillas; auditor tampoco); advertencias advisory de duplicado/solape.
- Build verde. Aplicar `0008` en Supabase (Nicolas).

## Trazabilidad

- Relaciona: `ADR-0007` (motor/soft-delete/overrides), `ADR-0009` (panel admin), `DEBT-0007` (atomicidad).
- Core: `db/migrations/0008_templates.sql`. No-core: UI admin (crear plantilla, asignar a todos/por
  usuario, popup de propagación, advertencias).
- Marcador: `[CORE-APPROVED: ADR-0015]`.
