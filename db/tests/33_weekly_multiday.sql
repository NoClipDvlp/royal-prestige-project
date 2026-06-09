-- TESTS recurrencia multi-día (NO core) — ADR-0019 / migración 0012. is_task_due weekly + retrocompat.
-- Año 2028 (libre). Reusa fixtures de usuario/distribución (a1 / aaaa). Tareas en 2028 (futuro) → el
-- trigger materialize_task_today NO crea instancias (start > hoy) → no contamina otros tests.

-- ── Fixtures ─────────────────────────────────────────────────────────────────
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, weekdays) values
  -- weekly MULTI-DÍA {lun, mié}; start sábado 2028-01-01
  ('3a000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','W multi','2028-01-01','weekly','{1,3}'),
  -- weekly LEGACY (weekdays NULL); start 2028-02-01
  ('3b000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','W legacy','2028-02-01','weekly', null),
  -- daily / monthly / once (weekdays NULL → intactos)
  ('3c000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','D','2028-03-01','daily', null),
  ('3d000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','M','2028-03-15','monthly', null),
  ('3e000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','O','2028-03-10','once', null);

\echo '===== ADR-0019: sanity de días + weekly MULTI-DÍA {lun,mié} ====='
do $$
declare wm public.tasks;
begin
  select * into wm from public.tasks where id='3a000000-0000-0000-0000-000000000000';
  -- sanity: confirmar el día de la semana de cada fecha usada (isodow 1=lun … 7=dom)
  assert extract(isodow from date '2028-01-01')::int = 6, 'sanity 2028-01-01 = sábado';
  assert extract(isodow from date '2028-01-03')::int = 1, 'sanity 2028-01-03 = lunes';
  assert extract(isodow from date '2028-01-04')::int = 2, 'sanity 2028-01-04 = martes';
  assert extract(isodow from date '2028-01-05')::int = 3, 'sanity 2028-01-05 = miércoles';
  assert extract(isodow from date '2028-01-09')::int = 7, 'sanity 2028-01-09 = domingo';
  -- multi-día: due SOLO lunes y miércoles (incluida semanas siguientes); el start (sábado) NO es due
  assert not public.is_task_due(wm, '2028-01-01'), 'sábado (start) NO due';
  assert     public.is_task_due(wm, '2028-01-03'), 'lunes due';
  assert not public.is_task_due(wm, '2028-01-04'), 'martes NO due';
  assert     public.is_task_due(wm, '2028-01-05'), 'miércoles due';
  assert not public.is_task_due(wm, '2028-01-09'), 'domingo NO due';
  assert     public.is_task_due(wm, '2028-01-10'), 'lunes (semana sig.) due';
  assert     public.is_task_due(wm, '2028-01-12'), 'miércoles (semana sig.) due';
  -- antes del start nunca
  assert not public.is_task_due(wm, '2027-12-29'), 'antes del start NO due (aunque sea miércoles)';
end $$;

\echo '===== retrocompat: weekly LEGACY (sin días) → día de start_date, SIN regresión ====='
do $$
declare wl public.tasks;
begin
  select * into wl from public.tasks where id='3b000000-0000-0000-0000-000000000000';
  assert     public.is_task_due(wl, '2028-02-01'), 'legacy: start due';
  assert     public.is_task_due(wl, '2028-02-08'), 'legacy: +7 due';
  assert     public.is_task_due(wl, '2028-02-15'), 'legacy: +14 due';
  assert not public.is_task_due(wl, '2028-02-02'), 'legacy: +1 NO due';
  assert not public.is_task_due(wl, '2028-02-07'), 'legacy: +6 NO due';
end $$;

\echo '===== daily / monthly / once intactos (weekdays NULL) ====='
do $$
declare dd public.tasks; mm public.tasks; oo public.tasks;
begin
  select * into dd from public.tasks where id='3c000000-0000-0000-0000-000000000000';
  select * into mm from public.tasks where id='3d000000-0000-0000-0000-000000000000';
  select * into oo from public.tasks where id='3e000000-0000-0000-0000-000000000000';
  -- daily: cualquier día >= start
  assert public.is_task_due(dd, '2028-03-01') and public.is_task_due(dd, '2028-03-02'), 'daily due cada día';
  -- monthly: mismo día-de-mes
  assert     public.is_task_due(mm, '2028-04-15'), 'monthly: 15 due';
  assert not public.is_task_due(mm, '2028-04-16'), 'monthly: 16 NO due';
  -- once: solo el start
  assert     public.is_task_due(oo, '2028-03-10'), 'once: start due';
  assert not public.is_task_due(oo, '2028-03-11'), 'once: +1 NO due';
end $$;

\echo '===== materialize_day respeta el filtro multi-día ====='
do $$
declare n int;
begin
  -- el lunes 2028-01-03 debe materializar la weekly multi-día (3a); el martes 2028-01-04 NO
  perform public.materialize_day('2028-01-03');
  select count(*) into n from public.task_instances where task_id='3a000000-0000-0000-0000-000000000000' and date='2028-01-03';
  assert n = 1, 'materializa el lunes';
  perform public.materialize_day('2028-01-04');
  select count(*) into n from public.task_instances where task_id='3a000000-0000-0000-0000-000000000000' and date='2028-01-04';
  assert n = 0, 'NO materializa el martes';
end $$;

\echo '===== CHECK rechaza días inválidos ====='
do $$
begin
  begin
    insert into public.tasks (owner_user_id, distribution_id, title, start_date, recurrence, weekdays)
      values ('a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','bad','2028-05-01','weekly','{0}');
    raise exception 'XFAIL: weekdays {0} aceptado';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if; end;
  begin
    insert into public.tasks (owner_user_id, distribution_id, title, start_date, recurrence, weekdays)
      values ('a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','bad','2028-05-01','weekly','{8}');
    raise exception 'XFAIL: weekdays {8} aceptado';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if; end;
end $$;

\echo '===== 33_weekly_multiday OK ====='
