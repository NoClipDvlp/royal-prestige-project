-- TESTS set_task_status (ADR-0025 / migración 0016). Materialize-on-demand + gate de propiedad en DB.
-- Reusa fixtures: a1/b1 (distribuidores), 11111111 (admin). Todo en una transacción con rollback.

begin;
  -- tarea DIARIA de a1 (due cualquier día) — insertada como superusuario; start 2030 → no materializa hoy.
  insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence)
  values ('37370000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Diaria test','2030-01-01','daily');

  \echo '===== el DUEÑO marca un día FUTURO sin instancia → se crea + estado (materialize-on-demand) ====='
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    perform public.set_task_status('37370000-0000-0000-0000-000000000000','2031-03-03',100::smallint);
    assert (select status_pct from public.task_instances
            where task_id='37370000-0000-0000-0000-000000000000' and date='2031-03-03') = 100,
      'instancia creada con estado 100';
    -- re-marcar (upsert) cambia el estado
    perform public.set_task_status('37370000-0000-0000-0000-000000000000','2031-03-03',50::smallint);
    assert (select status_pct from public.task_instances
            where task_id='37370000-0000-0000-0000-000000000000' and date='2031-03-03') = 50,
      'upsert: 100 → 50';
  end $$;

  \echo '===== NO-DUEÑO (otro distribuidor) → "no autorizado" ====='
  select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    begin
      perform public.set_task_status('37370000-0000-0000-0000-000000000000','2031-03-05',100::smallint);
      raise exception 'XFAIL: no-dueño pudo marcar';
    exception when others then
      if sqlerrm like 'XFAIL%' then raise; end if;  -- bloqueado = OK
    end;
  end $$;

  \echo '===== ADMIN sí puede marcar cualquier tarea ====='
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    perform public.set_task_status('37370000-0000-0000-0000-000000000000','2031-03-06',100::smallint);
    assert (select status_pct from public.task_instances
            where task_id='37370000-0000-0000-0000-000000000000' and date='2031-03-06') = 100,
      'admin marca';
  end $$;

  \echo '===== estado inválido y día excluido → rechazados ====='
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    begin perform public.set_task_status('37370000-0000-0000-0000-000000000000','2031-03-07',33::smallint);
      raise exception 'XFAIL: aceptó pct inválido';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if; end;
  end $$;
rollback;
\echo '===== 37_set_task_status OK ====='
