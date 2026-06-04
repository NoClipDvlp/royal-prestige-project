-- ============================================================================
-- Royal Control — 0010_customized_trigger  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0016.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX]. Commit con [CORE-APPROVED: ADR-0016].
--
-- Plantillas Fase 2c (ADR-0016): marca tasks.customized_at cuando el DISTRIBUIDOR edita la DEFINICIÓN de
-- una tarea vinculada a una plantilla → la propagación no-destructiva (no-core) la respeta (no pisa).
-- La invariante vive en la DB → cubre TODOS los paths del distribuidor (presentes y futuros) sin que
-- ninguna server action tenga que recordar marcarla.
--
-- ⚠ GATE POR ROL (corazón del mecanismo): solo marca cuando app_current_role()='distributor'. La
--   PROPAGACIÓN corre como admin y el JOB como service_role (rol null) → NO marcan → la propagación no se
--   auto-marca (si lo hiciera, la 2ª propagación se saltaría todo). BEFORE UPDATE (no INSERT → asignar no marca).
-- ADITIVA: no toca RLS ni el motor (is_task_due/materialize_day).
-- ============================================================================

create or replace function public.mark_task_customized()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select public.app_current_role()) = 'distributor'::public.app_role
     and new.template_item_id is not null
     and (
          new.title            is distinct from old.title
       or new.time_slot        is distinct from old.time_slot
       or new.priority         is distinct from old.priority
       or new.category_id      is distinct from old.category_id
       or new.recurrence       is distinct from old.recurrence
       or new.duration_minutes is distinct from old.duration_minutes
     )
  then
    new.customized_at := now();
  end if;
  return new;
end $$;

create trigger trg_tasks_mark_customized
  before update on public.tasks
  for each row execute function public.mark_task_customized();
