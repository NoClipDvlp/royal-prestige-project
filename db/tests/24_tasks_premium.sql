-- TESTS TAREAS PREMIUM (NO core) — ADR-0011 / migración 0004.
-- Cubre: CHECK de duración (>0, tope 22:00, GUARD anti wrap-around medianoche), override en
-- task_instances, y RPC tasks_due_on(d) SECURITY INVOKER (recurrencia correcta + RLS self con 2
-- usuarios + admin ve todo). Reutiliza fixtures (aaaa1111 de a1, bbbb1111 de b1) y tareas de 23 (d*).
-- Patrón XFAIL (igual que 23): si la sentencia que DEBE fallar pasa, se lanza 'XFAIL...' y re-eleva.

\echo '===== CHECK duración tasks: >0, tope 22:00 inclusive, GUARD wrap-around medianoche ====='
do $$
begin
  -- POSITIVOS (deben insertarse sin error)
  insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, time_slot, duration_minutes)
    values ('e1000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','dur 20:00+60','2026-06-01','once','20:00',60);
  -- borde exacto: 20:00 + 120 = 22:00 → permitido (≤ 22:00, inclusive)
  insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, time_slot, duration_minutes)
    values ('e2000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','dur 20:00+120=22:00','2026-06-01','once','20:00',120);
  -- Opción A: duración SIN time_slot → permitida (no se aplica el tope sin hora)
  insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, time_slot, duration_minutes)
    values ('e3000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','dur sin hora','2026-06-01','once',null,300);

  -- NEGATIVO: 20:00 + 121 = 22:01 > 22:00 → debe fallar
  begin
    insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, time_slot, duration_minutes)
      values ('e4000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','dur 20:00+121','2026-06-01','once','20:00',121);
    raise exception 'XFAIL: CHECK permitió 20:00+121 (pasa de 22:00)';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;

  -- NEGATIVO CRÍTICO (wrap-around): 21:00 + 180 = 24:00. Un CHECK ingenuo con `time + interval` daría
  -- '00:00' ≤ 22:00 = PASA (falso OK). Con aritmética en minutos: 1260+180=1440 > 1320 → DEBE FALLAR.
  begin
    insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, time_slot, duration_minutes)
      values ('e5000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','dur 21:00+180 (wrap)','2026-06-01','once','21:00',180);
    raise exception 'XFAIL: CHECK permitió 21:00+180 — wrap-around de medianoche no atrapado';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;

  -- NEGATIVO: duración 0 → debe fallar (>0)
  begin
    insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, time_slot, duration_minutes)
      values ('e6000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','dur 0','2026-06-01','once','20:00',0);
    raise exception 'XFAIL: CHECK permitió duración 0';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;

  -- NEGATIVO: duración negativa → debe fallar (>0)
  begin
    insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, time_slot, duration_minutes)
      values ('e7000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','dur -5','2026-06-01','once','20:00',-5);
    raise exception 'XFAIL: CHECK permitió duración negativa';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;
end $$;

\echo '===== CHECK duración override en task_instances (>0, tope; cap del efectivo = app-layer) ====='
-- Task + instancia futura limpia para probar el override.
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence)
  values ('ec000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','override dur','2026-06-01','daily');
insert into public.task_instances (task_id, date) values ('ec000000-0000-0000-0000-000000000000','2026-07-01');
do $$
begin
  -- POSITIVO: override 20:00 + 120 = 22:00 → OK
  update public.task_instances set duration_minutes = 120, time_slot = '20:00'
    where task_id='ec000000-0000-0000-0000-000000000000' and date='2026-07-01';

  -- NEGATIVO: 20:00 + 121 → falla
  begin
    update public.task_instances set duration_minutes = 121, time_slot = '20:00'
      where task_id='ec000000-0000-0000-0000-000000000000' and date='2026-07-01';
    raise exception 'XFAIL: override permitió 20:00+121';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;

  -- NEGATIVO wrap-around: 21:00 + 180 → falla
  begin
    update public.task_instances set duration_minutes = 180, time_slot = '21:00'
      where task_id='ec000000-0000-0000-0000-000000000000' and date='2026-07-01';
    raise exception 'XFAIL: override permitió 21:00+180 (wrap)';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;

  -- NEGATIVO: duración 0 → falla
  begin
    update public.task_instances set duration_minutes = 0
      where task_id='ec000000-0000-0000-0000-000000000000' and date='2026-07-01';
    raise exception 'XFAIL: override permitió duración 0';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;

  -- POSITIVO (Opción A): override solo duración, time_slot NULL en la instancia → OK a nivel DB.
  -- (El tope contra el time_slot EFECTIVO coalesce(instancia→task) NO se valida aquí: es app-layer.)
  update public.task_instances set duration_minutes = 90, time_slot = null
    where task_id='ec000000-0000-0000-0000-000000000000' and date='2026-07-01';
end $$;

\echo '===== tasks_due_on(d): recurrencia, excluye deleted_at, RLS self (a1 vs b1) + admin ve todo ====='
-- a1 (distributor, distribución A): ve SOLO sus tareas due; nunca las de b1; nunca las soft-deleted.
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    -- due el 2026-06-01: once de fixtures (aaaa1111) + daily (d1)
    assert exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='aaaa1111-0000-0000-0000-000000000000'),
      'a1: aaaa1111 (once 06-01) due y visible';
    assert exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='d1000000-0000-0000-0000-000000000000'),
      'a1: d1 (daily) due 06-01';
    -- RLS self: NO ve la tarea de b1 (otra distribución)
    assert not exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='bbbb1111-0000-0000-0000-000000000000'),
      'a1: NO debe ver bbbb1111 (tarea de b1) — RLS self';
    -- soft-delete: d7 (deleted) NO aparece aunque sería due (daily)
    assert not exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='d7000000-0000-0000-0000-000000000000'),
      'a1: d7 (deleted_at) excluida del RPC';
    -- excluded_dates: d6 excluye 06-05 → NO due 06-05, SÍ due 06-06
    assert not exists (select 1 from public.tasks_due_on(date '2026-06-05') where id='d6000000-0000-0000-0000-000000000000'),
      'a1: d6 excluida el 06-05 (excluded_dates)';
    assert exists (select 1 from public.tasks_due_on(date '2026-06-06') where id='d6000000-0000-0000-0000-000000000000'),
      'a1: d6 due el 06-06 (no excluida)';
    -- once: d4 due 06-10, no 06-11
    assert exists (select 1 from public.tasks_due_on(date '2026-06-10') where id='d4000000-0000-0000-0000-000000000000'),
      'a1: d4 (once) due 06-10';
    assert not exists (select 1 from public.tasks_due_on(date '2026-06-11') where id='d4000000-0000-0000-0000-000000000000'),
      'a1: d4 (once) NO due 06-11';
  end $$;
rollback;

-- b1 (distributor, distribución B): ve SOLO la suya; nunca las de a1.
begin;
  select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    assert exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='bbbb1111-0000-0000-0000-000000000000'),
      'b1: bbbb1111 (once 06-01) due y visible';
    assert not exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='aaaa1111-0000-0000-0000-000000000000'),
      'b1: NO debe ver aaaa1111 (tarea de a1) — RLS self';
    assert not exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='d1000000-0000-0000-0000-000000000000'),
      'b1: NO debe ver d1 (tarea de a1) — RLS self';
  end $$;
rollback;

-- admin: ve las tareas de AMBAS distribuciones (RLS admin = todo).
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    assert exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='aaaa1111-0000-0000-0000-000000000000'),
      'admin: ve aaaa1111 (distribución A)';
    assert exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='bbbb1111-0000-0000-0000-000000000000'),
      'admin: ve bbbb1111 (distribución B)';
    -- el admin tampoco ve soft-deleted (lo filtra el RPC, no la RLS)
    assert not exists (select 1 from public.tasks_due_on(date '2026-06-01') where id='d7000000-0000-0000-0000-000000000000'),
      'admin: d7 (deleted_at) excluida del RPC';
  end $$;
rollback;

\echo '===== TAREAS PREMIUM (core 0004): duración + tope sin wrap + RPC SECURITY INVOKER RLS self — VERDE ====='
