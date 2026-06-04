-- ============================================================================
-- Royal Control — 0008_templates  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0015.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0015].
--
-- Plantillas de tareas — Fase 1 (estructura + RLS). ADR-0015.
--   task_templates (global) → template_items (blueprints de tarea, SIN start_date) → template_assignments
--   (qué distribuidores la tienen). tasks gana template_id/template_item_id (provenance) + customized_at
--   (señal de "el distribuidor editó esta tarea de plantilla" → la propagación de Fase 2 NO la pisa).
-- ADITIVA: NO toca el motor (is_task_due/materialize_day/triggers) ni la RLS de tasks/task_instances.
-- La asignación/propagación/desasignación y el seteo de customized_at son Fase 2 (no-core).
-- ============================================================================

-- ── Tablas ───────────────────────────────────────────────────────────────────
create table public.task_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid not null references public.users(id),
  deleted_at  timestamptz,                        -- soft-delete (la plantilla no rompe tareas ya materializadas)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Blueprint de tarea: forma sin start_date (el ancla la pone la asignación en Fase 2).
create table public.template_items (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.task_templates(id) on delete cascade,  -- parte de la plantilla
  title            text not null,
  category_id      uuid references public.task_categories(id) on delete set null,
  priority         public.task_priority not null default 'medium',
  recurrence       public.recurrence_type not null default 'once',
  time_slot        time,
  duration_minutes int,
  created_at       timestamptz not null default now(),
  -- Espejo del CHECK de 0004 (aritmética en MINUTOS, sin wrap de medianoche): >0 y tope franja 22:00.
  constraint chk_template_item_duration check (
    duration_minutes is null
    or (
      duration_minutes > 0
      and (time_slot is null or (extract(epoch from time_slot)::int / 60 + duration_minutes) <= 22 * 60)
    )
  )
);

create table public.template_assignments (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  assigned_by uuid not null references public.users(id),
  assigned_at timestamptz not null default now(),
  active      boolean not null default true,       -- desasignado = false (conserva el registro)
  unique (template_id, user_id)                    -- un assignment por par (semántica de re-asignar = Fase 2)
);

-- ── Vínculo en tasks (provenance + señal de edición del distribuidor) ─────────
-- ON DELETE SET NULL (NO cascade): borrar una plantilla deja las tareas del distribuidor VIVAS y su KPI
-- histórico intacto (línea dura de ADR-0007). customized_at: lo setea la edición del distribuidor (Fase 2);
-- NULL = intacta (la propagación puede actualizar), NOT NULL = editada (la propagación NO pisa).
alter table public.tasks
  add column template_id      uuid references public.task_templates(id) on delete set null,
  add column template_item_id uuid references public.template_items(id) on delete set null,
  add column customized_at    timestamptz;

-- ── Índices (FK lookups + propagación de Fase 2) ─────────────────────────────
create index idx_template_items_template on public.template_items(template_id);
create index idx_tassign_template on public.template_assignments(template_id);
create index idx_tassign_user on public.template_assignments(user_id);
create index idx_tasks_template_item on public.tasks(template_item_id);

-- ── updated_at de task_templates (reusa el helper de 0000) ────────────────────
create trigger trg_templates_updated before update on public.task_templates
  for each row execute function public.set_updated_at();

-- ── RLS: las 3 tablas de plantilla son ADMIN-ONLY (default-deny para el resto) ──
-- El distribuidor/auditor NO leen plantillas; las tareas materializadas se operan con la RLS EXISTENTE
-- de tasks/task_instances (owner=self) — las columnas nuevas son metadato de la propia fila, ya cubiertas.
do $$
declare t text;
begin
  foreach t in array array['task_templates','template_items','template_assignments'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force  row level security;', t);
  end loop;
end $$;

create policy templates_admin on public.task_templates for all
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
create policy template_items_admin on public.template_items for all
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
create policy template_assignments_admin on public.template_assignments for all
  using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');

-- ── GRANTs (la RLS gatea por rol; anon sin acceso) ───────────────────────────
grant select, insert, update, delete on
  public.task_templates, public.template_items, public.template_assignments to authenticated;
grant all on public.task_templates, public.template_items, public.template_assignments to service_role;
