-- 0011_user_delete_fks.sql — ADR-0017: integridad del borrado de usuario.
--
-- PROBLEMA: borrar un usuario (auth.users → cascade public.users) fallaba con 23503 porque 4 FKs → users(id)
-- estaban en NO ACTION (sin `on delete`). El comentario "CASCADE borra todo" de adminDeleteUser era falso.
--
-- FIX (ADR-0017):
--   • Autoría de artefactos COMPARTIDOS → nullable + ON DELETE SET NULL (sobreviven sin autor):
--       task_categories.created_by, task_templates.created_by, template_assignments.assigned_by.
--   • Desnormalizados de task_instances → ON DELETE CASCADE:
--       task_instances.owner_user_id (→users), task_instances.distribution_id (→distributions).
--
-- Categorías PERSONALES del usuario: NO necesitan trato especial — ya las borra el cascade existente de
-- task_categories.owner_user_id, y chk_category_scope EXIGE personal⇒owner NOT NULL (no pueden quedar huérfanas).
--
-- Idempotente: `alter column drop not null` es idempotente; FKs vía `drop constraint if exists` + `add`.

-- 1) Columnas de autoría → nullable (metadata-only; NO reescribe filas existentes).
alter table public.task_categories      alter column created_by  drop not null;
alter table public.task_templates       alter column created_by  drop not null;
alter table public.template_assignments alter column assigned_by drop not null;

-- 2) FKs de autoría → ON DELETE SET NULL.
alter table public.task_categories
  drop constraint if exists task_categories_created_by_fkey;
alter table public.task_categories
  add  constraint task_categories_created_by_fkey
    foreign key (created_by) references public.users(id) on delete set null;

alter table public.task_templates
  drop constraint if exists task_templates_created_by_fkey;
alter table public.task_templates
  add  constraint task_templates_created_by_fkey
    foreign key (created_by) references public.users(id) on delete set null;

alter table public.template_assignments
  drop constraint if exists template_assignments_assigned_by_fkey;
alter table public.template_assignments
  add  constraint template_assignments_assigned_by_fkey
    foreign key (assigned_by) references public.users(id) on delete set null;

-- 3) Desnormalizados de task_instances → ON DELETE CASCADE.
alter table public.task_instances
  drop constraint if exists task_instances_owner_user_id_fkey;
alter table public.task_instances
  add  constraint task_instances_owner_user_id_fkey
    foreign key (owner_user_id) references public.users(id) on delete cascade;

alter table public.task_instances
  drop constraint if exists task_instances_distribution_id_fkey;
alter table public.task_instances
  add  constraint task_instances_distribution_id_fkey
    foreign key (distribution_id) references public.distributions(id) on delete cascade;
