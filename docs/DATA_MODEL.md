# DATA MODEL — Royal Control

> Verdad del modelo de datos. El Agente verifica aquí antes de tocar nada de datos.
> El esquema **nace preparado para post-MVP** (JD, Vendedor) aunque la lógica no se
> construya aún: FKs nullable y jerarquía lista evitan una migración dolorosa después.
> DB: PostgreSQL (Supabase). Aislamiento por distribución vía **RLS** (core).

---

## Entidades

### `distributions` (distribuciones)
- `id` uuid pk
- `name` text
- `logo_url` text
- `created_at`, `updated_at`

### `users` (perfiles; auth la maneja Supabase Auth)
- `id` uuid pk (= auth.users.id)
- `full_name` text
- `email` text unique
- `phone` text null   *(solo identificador, no se usa para auth)*
- `photo_url` text null
- `role` enum `app_role` null  *(null = sin rol → pantalla "contacta a tu admin")*
- `distribution_id` uuid null fk → distributions  *(Auditor/Admin = null)*
- `auth_providers` text[]  *(ej. {'password','google'} — ambos permitidos)*
- `preferences` jsonb  *(franja horaria custom, tema claro/oscuro, vista compacta/ampliada)*
- `created_at`, `updated_at`

### `app_role` (enum)
`admin | auditor | distributor | jd | seller`
*(jd y seller existen en el enum desde día 1; su lógica es post-MVP.)*

### `distribution_owners` (propiedad — máx 3 por distribución)
- `id` uuid pk
- `distribution_id` uuid fk → distributions
- `user_id` uuid fk → users
- unique(`distribution_id`, `user_id`)
- **Regla (trigger/check):** máximo 3 owners por distribución.
- *Separado del rol a propósito: ser owner ≠ ser distribuidor.*

### `org_hierarchy` (jerarquía post-MVP — preparada, nullable)
- `id` uuid pk
- `user_id` uuid fk → users
- `parent_user_id` uuid null fk → users  *(JD bajo distribuidor; vendedor bajo JD o null=cuelga de distribución)*
- `distribution_id` uuid fk → distributions
- *MVP: tabla existe pero no se puebla con JD/seller todavía.*

### `task_categories`
- `id` uuid pk
- `name` text
- `color` text  *(neutro/pastel; sin bordes de color en UI)*
- `scope` enum `category_scope` = `global | personal`
- `owner_user_id` uuid null fk → users  *(null si global; set si personal)*
- `created_by` uuid fk → users
- *Global la crea Admin → aparece como default a todos. Personal la crea cada usuario.*

### `tasks` (definición / plantilla de la tarea)
- `id` uuid pk
- `owner_user_id` uuid fk → users  *(de quién es la tarea)*
- `assigned_by_user_id` uuid null fk → users  *(null = self; set = superior)*
- `origin` enum `task_origin` = `self | superior`  *(metadato; NO afecta el cálculo de KPI)*
- `distribution_id` uuid fk → distributions
- `title` text
- `category_id` uuid null fk → task_categories
- `priority` enum `task_priority` = `low | medium | high`  *(pondera el KPI)*
- `recurrence` enum `recurrence_type` = `once | daily | weekly | monthly`
- `start_date` date
- `time_slot` time null  *(hora dentro de la franja; varias tareas por hora permitidas)*
- `created_at`, `updated_at`

### `task_instances` (ocurrencia concreta de un día — fuente de verdad del cumplimiento)
- `id` uuid pk
- `task_id` uuid fk → tasks
- `date` date
- `status_pct` smallint check in (0, 50, 100) default 0  *(estado CERRADO)*
- `completed_at` timestamptz null
- unique(`task_id`, `date`)
- **Regla clave:** cada instancia diaria de una recurrente **nace en 0**. NO se arrastra
  el estado. El histórico de instancias previas conserva el incumplimiento (sirve a alertas).

### `metric_snapshots` (histórico congelado)
- `id` uuid pk
- `user_id` uuid fk → users
- `period` enum `snapshot_period` = `monthly | quarterly`
- `period_start` date, `period_end` date
- `compliance_pct` numeric  *(ponderado por prioridad)*
- `tasks_done` int, `tasks_half` int, `tasks_undone` int
- `payload` jsonb  *(detalle para vista ampliada)*
- unique(`user_id`, `period`, `period_start`)
- *No se recalcula en vivo: se congela mensual y trimestral.*

### `calendar_links` (conexión Google)
- `id` uuid pk
- `user_id` uuid fk → users
- `google_calendar_id` text
- `sync_direction` text default `'push_only'`  *(MVP: solo app→Google)*
- `scopes` text[]  *(login + calendar — mixto)*

### `calendar_sync_conflicts`
- `id` uuid pk
- `user_id` uuid fk → users
- `task_instance_id` uuid fk → task_instances
- `type` text  *(ej. 'deleted_in_google')*
- `resolved` boolean default false
- *Si el usuario borra el evento en Google → se registra conflicto + alerta; el usuario decide.*

### `notifications`
- `id` uuid pk
- `user_id` uuid fk → users
- `kind` text  *(MVP: 'web_push')*
- `summary` text  *(formato resumen, no una por tarea)*
- `sent_at` timestamptz null

---

## Reglas de negocio de datos (duras)

1. **Estado de tarea es enum cerrado {0,50,100}.** Ningún otro valor es válido.
2. **Recurrente nace en 0 cada día.** El arrastre es de *registro histórico*, no de estado.
3. **Máx 3 owners por distribución** (enforced en `distribution_owners`).
4. **Un distribuidor → una sola distribución.** Una distribución → N distribuidores.
5. **Toda tarea cuenta igual** para el KPI; `origin` es solo filtro, ponderación = prioridad.
6. **Snapshots no se recalculan** una vez congelados (mensual/trimestral).
7. **Aislamiento por distribución vía RLS** (en /core): un distribuidor solo ve su data;
   el auditor ve métricas de todas; el admin ve todo. Un error aquí filtra datos → es core.
8. **Usuario sin rol** (`role IS NULL`) no puede leer ninguna tabla de negocio (RLS lo bloquea).

## Lo que es CORE en este modelo

`db/schema.sql`, migraciones base, y las políticas RLS son **core** (ver CORE_MANIFEST).
Cambiarlos requiere ADR + aprobación humana.
