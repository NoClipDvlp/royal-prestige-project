# ADR-0017 — Integridad referencial al borrar un usuario (`ON DELETE`)

- **Estado:** aceptado
- **Fecha:** 2026-06-04
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (diagnóstico solo-lectura)
- **¿Toca /core?:** SÍ → `db/migrations/0011_user_delete_fks.sql`. Aprobación humana 2026-06-04.
  **DISCIPLINA REFORZADA**. Corrige bug crítico QA #5.

## Contexto

`adminDeleteUser` borra la fila de `auth.users` confiando en que el `CASCADE` de `public.users.id →
auth.users(id)` arrastre todo. **El cascade es incompleto.** Cuatro FKs hacia `users(id)` están en
`NO ACTION` y bloquean el borrado con `23503` ("Database error deleting user"):

| FK | columna | nota |
|---|---|---|
| `task_categories.created_by` | NOT NULL | falla al borrar quien creó categorías |
| `task_templates.created_by` | NOT NULL | falla al borrar quien creó plantillas |
| `template_assignments.assigned_by` | NOT NULL | falla al borrar quien asignó |
| `task_instances.owner_user_id` | desnormalizado | NO ACTION (rescatado a veces por el cascade de tasks, pero frágil) |

Garantizado: borrar un **admin/auditor** que creó categorías globales / plantillas / asignaciones falla.

## Decisión

Migración `0011` que corrige las cuatro FKs:

- **`created_by` / `assigned_by`** (autoría) → volverlas **nullable** + `ON DELETE SET NULL`. El objeto
  (categoría global, plantilla, asignación) **sobrevive sin autor** — son artefactos del negocio, no
  deben morir con quien los creó. *(El Agente afina en pre-flight el caso de categorías **personales**:
  quedan huérfanas-inocuas con `created_by NULL`, o se borran con el dueño vía trigger — su recomendación.)*
- **`task_instances.owner_user_id` / `distribution_id`** (desnormalizados) → `ON DELETE CASCADE`. Son
  copia desnormalizada; se van con el dueño/distribución.

`CASCADE` en `created_by`/`assigned_by` se **descarta** (borrar un admin borraría las categorías globales
y plantillas de todos — catastrófico). `SET NULL` preserva.

## Qué se borró / simplificó
- El parche no-core (reasignar refs a mano antes de borrar): descartado por carrera e incompletitud.

## Riesgos
- **[MEDIO]** Una FK no contemplada volvería a bloquear. Verificación: el pre-flight enumera **todas** las
  FKs `→ users(id)` y confirma que las 4 quedan cubiertas (y descarta una 5ª).
- **[BAJO]** Categorías personales huérfanas (`created_by NULL`) inocuas (su RLS por `created_by` no las
  expone). Refinable.

## Verificación obligatoria
- Tests: borrar un admin que creó categoría global + plantilla + asignación → **éxito**; la categoría/
  plantilla sobreviven con `created_by/assigned_by NULL`; las tasks/instances del user se van (cascade).
  Borrar un distribuidor con tareas/categoría personal → éxito. Build verde. Aplicar `0011` en Supabase.

## Trazabilidad
- Relaciona `0000_init` (FKs), `0008_templates`. Core: `db/migrations/0011_user_delete_fks.sql`.
- Marcador: `[CORE-APPROVED: ADR-0017]`.
