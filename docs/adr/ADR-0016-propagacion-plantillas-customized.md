# ADR-0016 — Propagación de plantillas (Fase 2c): trigger `customized_at` + UPDATE no-destructivo

- **Estado:** aceptado
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (análisis solo-lectura)
- **¿Toca /core?:** SÍ → `db/migrations/0010_customized_trigger.sql` (1 trigger). Aprobación humana
  2026-06-03. **DISCIPLINA REFORZADA**. Amplía **ADR-0015** (plantillas).

## Contexto

Fase 2c cierra plantillas: editar una plantilla puede **propagar** a las tareas ya asignadas, pero
**sin pisar** lo que el distribuidor personalizó (`customized_at IS NULL`). El riesgo ALTO: si algún
path de edición del distribuidor olvida marcar `customized_at`, la propagación lo pisa en silencio.
El análisis verificó que hoy solo `updateTask` edita la definición, pero el riesgo es **futuro**
(nuevos paths que olviden marcar).

## Decisión

### 1. Seteo de `customized_at` — trigger CORE role-gated (no app-layer)
Se rechaza marcar el flag en cada server action (frágil ante nuevos paths). Se pone la invariante en la
DB: **`db/migrations/0010` — trigger `BEFORE UPDATE ON public.tasks`**:

```
si app_current_role() = 'distributor'
   AND new.template_item_id IS NOT NULL
   AND (cambió alguna columna de DEFINICIÓN: title, time_slot, priority, category_id,
        recurrence, duration_minutes)
→ new.customized_at = now();
```

- **Gate por rol** (clave): el distribuidor que edita → marca; la **propagación (admin)** y el **job
  (rol null)** → NO marcan. Si no se gateara, la propagación se auto-marcaría y la 2ª propagación
  saltaría todo. `setStatus` (toca `task_instances`, no `tasks`) y `softDeleteTask` (la propagación ya
  excluye `deleted_at`) no son relevantes.
- **Bulletproof**: cubre todos los paths actuales y futuros sin depender de disciplina de la app.

### 2. Propagación — UPDATE no-destructivo de la definición de `tasks`
"Aplicar a asignados" ejecuta, por item editado:

```
UPDATE public.tasks SET title, category_id, priority, recurrence, time_slot, duration_minutes (del item)
WHERE template_item_id = :itemId
  AND customized_at IS NULL          -- no pisa lo que el distribuidor editó
  AND deleted_at IS NULL             -- no toca borradas
  AND owner_user_id IN (<asignados ACTIVE=true de esa plantilla>)
```

- **Línea dura:** solo toca la **definición de `tasks`**, NUNCA `task_instances` → status/KPI intactos.
- Preserva overrides de instancia (`coalesce`): los días con override conservan el suyo; los demás
  reflejan la nueva def. **Sin re-materialización** (la instancia de hoy sin override refleja la nueva
  def por `coalesce`). NO toca `recurrence_until`/`excluded_dates`.
- **Idempotente** → re-ejecutable (re-aplica los mismos valores a `customized_at IS NULL`).

### 3. Binario, opt-in por-plantilla
Al guardar la plantilla, la UI pregunta **una vez** (no por item): **"¿aplicar a asignados existentes /
solo a futuras?"**, cubriendo todos los items tocados en la sesión (menos clicks).
- **Solo futuras** = solo el `updateTemplateItem` ya existente (Fase 2a); cero propagación.
- **Aplicar** = `updateTemplateItem` + la propagación (§2) de los items tocados.
- **Add/remove de items** → siempre solo-futuras (no crea/borra tareas en asignados existentes).

### 4. Aviso de desvínculo al borrar item asignado
Antes del hard-delete de un item (Fase 2a), contar `tasks WHERE template_item_id=X AND deleted_at IS
NULL` y avisar ("Este item tiene N tareas asignadas; al borrarlo se desvinculan — siguen vivas, sin
plantilla"). Advisory + confirm. No-core.

## Qué se borró / simplificó

- Marcado app-layer del flag → trigger (elimina la fragilidad de raíz).
- Prompt por-item → por-plantilla (menos clicks).
- Propagación de add/remove de items → solo-futuras (sin crear/borrar tareas en asignados).

## Riesgos

- **[ALTO → eliminado]** Path de edición que no marque `customized_at` → el trigger role-gated lo cubre.
- **[ALTO]** Propagación tocando `task_instances` rompería el KPI → línea dura: solo `tasks`.
- **[MEDIO]** Trigger NO gateado por rol auto-marcaría la propagación → gate `='distributor'` obligatorio.
- **[BAJO]** Atomicidad `updateTemplateItem` ↔ propagación (2 sentencias) → recuperable, idempotente (DEBT-0007).

## Verificación obligatoria

- Tests trigger: distribuidor edita def de tarea vinculada → `customized_at` se setea; admin (propagación)
  y job (rol null) → NO lo setean; editar columna no-definición → no marca.
- Tests propagación: actualiza solo `customized_at IS NULL` + `deleted_at IS NULL` + owners activos;
  NUNCA toca `task_instances`/status; "solo futuras" no toca asignadas; idempotente.
- Aviso de desvínculo cuenta correcto. Build verde. Aplicar `0010` en Supabase.

## Trazabilidad

- Amplía **ADR-0015** (plantillas); relaciona `ADR-0007` (motor/overrides), `DEBT-0007` (atomicidad).
- Core: `db/migrations/0010_customized_trigger.sql`. No-core: propagación (server action) + prompt
  por-plantilla + aviso de desvínculo.
- Nº migración = `0010` (`0009` reservado para el sparkline ADR-0014, aún sin implementar — hueco temporal).
- Marcador: `[CORE-APPROVED: ADR-0016]`.
