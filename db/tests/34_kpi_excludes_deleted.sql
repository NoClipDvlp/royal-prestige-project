-- TESTS KPI excluye borradas (NO core) — ADR-0021 / migración 0013. Las 5 funciones de cálculo.
-- Año 2022 (PASADO y libre: las funciones capan d_end a app_today(), así que fechas futuras no contarían;
-- 2022 < hoy y disjunto de otros tests). Distribuidor a1 / distribución aaaa (de 10_fixtures).
-- Fixtures con session_replication_role=replica (insertar instances con owner/distrib explícitos, sin triggers).

set session_replication_role = replica;
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, priority, deleted_at, excluded_dates) values
  -- LIVE: cuenta entera
  ('4a000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Live','2022-01-10','daily','medium', null, '{}'),
  -- DELETED: no debe contar nada
  ('4b000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Deleted','2022-01-10','daily','medium', now(), '{}'),
  -- EXCLUDED day: el 2022-01-11 está en excluded_dates → esa instancia no cuenta
  ('4c000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Excl','2022-01-10','daily','medium', null, '{2022-01-11}');

insert into public.task_instances (task_id, date, status_pct, owner_user_id, distribution_id) values
  ('4a000000-0000-0000-0000-000000000000','2022-01-10',100,'a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000'),
  ('4a000000-0000-0000-0000-000000000000','2022-01-11',  0,'a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000'),
  ('4b000000-0000-0000-0000-000000000000','2022-01-10',100,'a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000'),
  ('4c000000-0000-0000-0000-000000000000','2022-01-10',100,'a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000'),
  ('4c000000-0000-0000-0000-000000000000','2022-01-11',100,'a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000');
set session_replication_role = default;

-- Esperado para a1 en [2022-01-01,2022-01-31]: LIVE(100,0) + EXCL(01-10:100; 01-11 excluida) = total 3,
-- done 2, undone 1, pct round((2*100+2*100+2*0)/(2*3))=67. (Sin el fix sería total 5, done 4, pct 80.)

\echo '===== ADR-0021: compliance_self (distribuidor) excluye borrada + día excluido ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare r record;
  begin
    select * into r from public.compliance_self('2022-01-01','2022-01-31');
    assert r.total = 3, format('self.total=%s (esperado 3)', r.total);
    assert r.done = 2, format('self.done=%s (esperado 2)', r.done);
    assert r.undone = 1, format('self.undone=%s (esperado 1)', r.undone);
    assert r.compliance_pct = 67, format('self.pct=%s (esperado 67)', r.compliance_pct);
  end $$;
rollback;

\echo '===== ranking / series / series_by_user / breakdown (auditor) — mismas exclusiones ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare r record; n int;
  begin
    -- ranking: grano user de a1
    select * into r from public.compliance_ranking('2022-01-01','2022-01-31')
      where grain='user' and user_id='a1a1a1a1-0000-0000-0000-000000000000';
    assert r.total = 3 and r.done = 2 and r.compliance_pct = 67, format('ranking a1 total=%s done=%s pct=%s', r.total, r.done, r.compliance_pct);

    -- series_by_user (month) de a1
    select coalesce(sum(total),0)::int into n from public.compliance_series_by_user('2022-01-01','2022-01-31','month')
      where user_id='a1a1a1a1-0000-0000-0000-000000000000';
    assert n = 3, format('series_by_user a1 total=%s (esperado 3)', n);

    -- series (month, p_user a1)
    select coalesce(sum(total),0)::int into n from public.compliance_series('2022-01-01','2022-01-31','month','a1a1a1a1-0000-0000-0000-000000000000');
    assert n = 3, format('series a1 total=%s (esperado 3)', n);

    -- breakdown (priority, p_user a1) → todo 'medium'
    select coalesce(sum(total),0)::int into n from public.compliance_breakdown('2022-01-01','2022-01-31','priority','a1a1a1a1-0000-0000-0000-000000000000');
    assert n = 3, format('breakdown a1 total=%s (esperado 3)', n);
  end $$;
rollback;

\echo '===== 34_kpi_excludes_deleted OK ====='
