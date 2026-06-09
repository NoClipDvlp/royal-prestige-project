-- 0016_set_task_status.sql — ADR-0025: marcar 0/50/100 en CUALQUIER tarea/día (materialize-on-demand).
--
-- Problema: setStatus solo hacía UPDATE de task_instances; ti_insert es admin-only → una tarea SIN instancia
-- materializada (día futuro, o hueco del cron) no tenía fila → la UPDATE afectaba 0 filas → no se marcaba.
--
-- Solución: función SECURITY DEFINER que crea la instancia (si falta) y fija el estado de forma ATÓMICA
-- (upsert). El DEFINER bypassa la RLS (ti_insert admin-only) — por eso la AUTORIZACIÓN va dentro: solo el
-- DUEÑO de la tarea o un admin. Valida que la tarea aplique ese día (is_task_due) y no esté excluido/borrado,
-- para no crear instancias espurias. El trigger de scope (0000) rellena owner/distribution en el INSERT.

create or replace function public.set_task_status(p_task_id uuid, p_date date, p_pct smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.tasks;
begin
  if p_pct not in (0, 50, 100) then
    raise exception 'estado inválido: %', p_pct;
  end if;

  select * into t from public.tasks where id = p_task_id;
  if not found or t.deleted_at is not null then
    raise exception 'tarea inexistente o borrada';
  end if;

  -- Gate de propiedad (el DEFINER bypassa RLS → autorizamos aquí): dueño o admin.
  if (select auth.uid()) is distinct from t.owner_user_id
     and (select public.app_current_role()) is distinct from 'admin'::public.app_role then
    raise exception 'no autorizado';
  end if;

  -- Solo días en que la tarea ocurre y no excluidos (evita instancias espurias).
  if not public.is_task_due(t, p_date) then
    raise exception 'la tarea no aplica ese día';
  end if;
  if p_date = any (t.excluded_dates) then
    raise exception 'día excluido';
  end if;

  insert into public.task_instances (task_id, date, status_pct, completed_at)
  values (p_task_id, p_date, p_pct, case when p_pct = 100 then now() else null end)
  on conflict (task_id, date) do update
    set status_pct = excluded.status_pct,
        completed_at = excluded.completed_at;
end $$;

revoke execute on function public.set_task_status(uuid, date, smallint) from public;
grant execute on function public.set_task_status(uuid, date, smallint) to authenticated;
