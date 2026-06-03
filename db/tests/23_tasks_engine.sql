-- TESTS MOTOR DE TAREAS (NO core) — ADR-0007 / migración 0003. Tareas frescas de distA1 (superusuario,
-- salvo los tests de RLS que cambian de rol). El trigger de alta crea instancias de "hoy" al INSERT.

-- Fixtures de tareas (owner distA1, distribución A). El INSERT dispara materialize_task_today (hoy).
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence) values
  ('d1000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','daily',  '2026-06-01','daily'),
  ('d2000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','weekly', '2026-06-01','weekly'),
  ('d3000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','monthly','2026-01-31','monthly'),
  ('d4000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','once',   '2026-06-10','once');
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, recurrence_until) values
  ('d5000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','until','2026-06-01','daily','2026-06-10');
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, excluded_dates) values
  ('d6000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','excl','2026-06-01','daily','{2026-06-05}');
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, deleted_at) values
  ('d7000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','deleted','2026-06-01','daily', now());

\echo '===== is_task_due: once/daily/weekly/monthly(clamp)/recurrence_until/excluded_dates ====='
do $$
declare b boolean;
  function_row public.tasks;
begin
  -- once (d4): due 06-10, no 06-11
  select public.is_task_due(t, date '2026-06-10') into b from public.tasks t where t.id='d4000000-0000-0000-0000-000000000000';
  assert b, 'once due 2026-06-10';
  select public.is_task_due(t, date '2026-06-11') into b from public.tasks t where t.id='d4000000-0000-0000-0000-000000000000';
  assert not b, 'once NO due 2026-06-11';
  -- daily (d1): due 06-05, no antes de start (05-31)
  select public.is_task_due(t, date '2026-06-05') into b from public.tasks t where t.id='d1000000-0000-0000-0000-000000000000';
  assert b, 'daily due 2026-06-05';
  select public.is_task_due(t, date '2026-05-31') into b from public.tasks t where t.id='d1000000-0000-0000-0000-000000000000';
  assert not b, 'daily NO due antes de start';
  -- weekly (d2, start 06-01): due 06-08 (+7), no 06-09 (+8)
  select public.is_task_due(t, date '2026-06-08') into b from public.tasks t where t.id='d2000000-0000-0000-0000-000000000000';
  assert b, 'weekly due 2026-06-08';
  select public.is_task_due(t, date '2026-06-09') into b from public.tasks t where t.id='d2000000-0000-0000-0000-000000000000';
  assert not b, 'weekly NO due 2026-06-09';
  -- monthly (d3, start 01-31): clamp → 02-28 due, 02-27 no, 04-30 due, 03-31 due
  select public.is_task_due(t, date '2026-02-28') into b from public.tasks t where t.id='d3000000-0000-0000-0000-000000000000';
  assert b, 'monthly clamp 2026-02-28';
  select public.is_task_due(t, date '2026-02-27') into b from public.tasks t where t.id='d3000000-0000-0000-0000-000000000000';
  assert not b, 'monthly NO 2026-02-27';
  select public.is_task_due(t, date '2026-04-30') into b from public.tasks t where t.id='d3000000-0000-0000-0000-000000000000';
  assert b, 'monthly clamp 2026-04-30';
  select public.is_task_due(t, date '2026-03-31') into b from public.tasks t where t.id='d3000000-0000-0000-0000-000000000000';
  assert b, 'monthly 2026-03-31';
  -- recurrence_until (d5, daily until 06-10): due 06-10, no 06-11
  select public.is_task_due(t, date '2026-06-10') into b from public.tasks t where t.id='d5000000-0000-0000-0000-000000000000';
  assert b, 'until due 2026-06-10';
  select public.is_task_due(t, date '2026-06-11') into b from public.tasks t where t.id='d5000000-0000-0000-0000-000000000000';
  assert not b, 'until NO due 2026-06-11';
  -- excluded_dates (d6, exclude 06-05): no 06-05, sí 06-06
  select public.is_task_due(t, date '2026-06-05') into b from public.tasks t where t.id='d6000000-0000-0000-0000-000000000000';
  assert not b, 'excluded 2026-06-05';
  select public.is_task_due(t, date '2026-06-06') into b from public.tasks t where t.id='d6000000-0000-0000-0000-000000000000';
  assert b, 'no-excluded 2026-06-06';
end $$;

\echo '===== materialize_day(2026-12-15): solo DUE+no-deleted, status=0, idempotente ====='
do $$
declare r2 int; st smallint;
begin
  perform public.materialize_day(date '2026-12-15');
  -- creadas
  assert exists (select 1 from public.task_instances where task_id='d1000000-0000-0000-0000-000000000000' and date='2026-12-15'), 'daily materializada 12-15';
  assert exists (select 1 from public.task_instances where task_id='d6000000-0000-0000-0000-000000000000' and date='2026-12-15'), 'excl materializada 12-15';
  -- NO creadas
  assert not exists (select 1 from public.task_instances where task_id='d5000000-0000-0000-0000-000000000000' and date='2026-12-15'), 'until NO (recurrence_until 06-10)';
  assert not exists (select 1 from public.task_instances where task_id='d7000000-0000-0000-0000-000000000000' and date='2026-12-15'), 'deleted NO materializa';
  assert not exists (select 1 from public.task_instances where task_id='d4000000-0000-0000-0000-000000000000' and date='2026-12-15'), 'once NO due 12-15';
  assert not exists (select 1 from public.task_instances where task_id='d3000000-0000-0000-0000-000000000000' and date='2026-12-15'), 'monthly NO due 12-15';
  -- status nace en 0
  select status_pct into st from public.task_instances where task_id='d1000000-0000-0000-0000-000000000000' and date='2026-12-15';
  assert st = 0, format('instancia nace en 0 (fue %s)', st);
  -- idempotente: 2ª llamada crea 0
  r2 := public.materialize_day(date '2026-12-15');
  assert r2 = 0, format('materialize_day idempotente, 2ª llamada creó %s (esperaba 0)', r2);
end $$;

\echo '===== trigger de alta: tarea due hoy → instancia de hoy al INSERT ====='
do $$
declare today date := public.app_today();
begin
  insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence)
  values ('d8000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','alta', today, 'daily');
  assert exists (select 1 from public.task_instances where task_id='d8000000-0000-0000-0000-000000000000' and date = today),
    'el trigger de alta materializó la instancia de hoy';
end $$;

\echo '===== soft-delete: borrada no materializa; distributor NO hard-delete; admin sí ====='
-- distributor (distA1) intenta DELETE real → 0 filas (policy admin-only)
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    with d as (delete from public.tasks where id='d1000000-0000-0000-0000-000000000000' returning 1)
      select count(*) into n from d;
    assert n = 0, format('distributor NO debe hard-delete tasks (borró %s)', n);
  end $$;
rollback;
-- admin SÍ puede hard-delete
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    with d as (delete from public.tasks where id='d4000000-0000-0000-0000-000000000000' returning 1)
      select count(*) into n from d;
    assert n = 1, format('admin debe poder hard-delete (borró %s)', n);
  end $$;
rollback;

\echo '===== inmutabilidad: no se puede cambiar owner/distribution/task_id de una instancia ====='
do $$
begin
  -- update legítimo (status + override title) → permitido
  update public.task_instances set status_pct = 50, title = 'override hoy'
    where task_id='d1000000-0000-0000-0000-000000000000' and date='2026-12-15';
  -- cambiar owner → excepción
  begin
    update public.task_instances set owner_user_id='b1b1b1b1-0000-0000-0000-000000000000'
      where task_id='d1000000-0000-0000-0000-000000000000' and date='2026-12-15';
    raise exception 'XFAIL: se permitió cambiar owner_user_id de una instancia';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;
end $$;

\echo '===== TAREAS PARTE A (motor DB): materialización + recurrencia + soft-delete + hardening — VERDE ====='
