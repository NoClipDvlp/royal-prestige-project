-- TESTS sparkline (NO core) — ADR-0014 / migración 0009 (compliance_series_by_user). Año 2025 (libre; DEBT-0012).
-- 2025-01-06 y 2025-01-13 son lunes → buckets semanales distintos.

-- ── Fixtures (superusuario). Tasks once (fecha pasada → sin instancia automática); instancias manuales. ──
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence) values
  ('d1010000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','a1 s06','2025-01-06','once'),
  ('d1020000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','a1 s13','2025-01-13','once'),
  ('d1030000-0000-0000-0000-000000000000','b1b1b1b1-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','b1 s06','2025-01-06','once');
insert into public.task_instances (task_id, date, status_pct) values
  ('d1010000-0000-0000-0000-000000000000','2025-01-06',100),
  ('d1020000-0000-0000-0000-000000000000','2025-01-13',0),
  ('d1030000-0000-0000-0000-000000000000','2025-01-06',50);

\echo '===== compliance_series_by_user (auditor): series por usuario, buckets semanales, ≥2 users ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare p int; n int;
  begin
    select compliance_pct into p from public.compliance_series_by_user(date '2025-01-06', date '2025-01-19','week')
      where user_id='a1a1a1a1-0000-0000-0000-000000000000' and bucket_start='2025-01-06';
    assert p = 100, format('a1 sem 01-06 pct %s', p);
    select compliance_pct into p from public.compliance_series_by_user(date '2025-01-06', date '2025-01-19','week')
      where user_id='a1a1a1a1-0000-0000-0000-000000000000' and bucket_start='2025-01-13';
    assert p = 0, format('a1 sem 01-13 pct %s', p);
    select compliance_pct into p from public.compliance_series_by_user(date '2025-01-06', date '2025-01-19','week')
      where user_id='b1b1b1b1-0000-0000-0000-000000000000' and bucket_start='2025-01-06';
    assert p = 50, format('b1 sem 01-06 pct %s', p);
    -- ≥2 distribuidores distintos en la salida (a1 + b1; cross-distribución)
    select count(distinct user_id) into n from public.compliance_series_by_user(date '2025-01-06', date '2025-01-19','week');
    assert n >= 2, format('users distintos %s (esp ≥2)', n);
    -- whitelist
    begin
      perform count(*) from public.compliance_series_by_user(date '2025-01-06', date '2025-01-19','year');
      raise exception 'XFAIL: bucket year no rechazado';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;

\echo '===== gate: distribuidor → 0 filas ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.compliance_series_by_user(date '2025-01-06', date '2025-01-19','week');
    assert n = 0, format('distribuidor series_by_user %s filas (esp 0)', n);
  end $$;
rollback;

\echo '===== SPARKLINE (core 0009): compliance_series_by_user (gate, semanal, ≥2 users, whitelist) — VERDE ====='
