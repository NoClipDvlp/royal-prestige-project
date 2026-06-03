-- TESTS MÉTRICAS (NO core) — ADR-0012 / migración 0005.
-- Fixtures en fechas FIJAS PASADAS (2020-01-15/16) → inmunes al reloj real (app_today()), salvo el
-- test del CAPADO que usa app_today() ± N a propósito. Patrón de roles igual que 23/24 (jwt + set role).

-- ── Fixtures de métricas (superusuario → bypass RLS) ─────────────────────────
-- self (2020-01-15): a1 high@100 + a1 low@0  → KPI = (3·100 + 1·0)/(3+1) = 75. b1 high@100 = aislamiento.
-- rank (2020-01-16): a1 high@100 (distA), a2 low@0 (distA), b1 med@100 (distB).
--   → rollup distA = (3·100 + 1·0)/(3+1) = 75 (NO 50 = promedio de 100 y 0). distB = 100.
-- cap: a1 high@100 en app_today()+10 (futuro) → debe quedar fuera del capado.
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, priority) values
  ('fa110000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','self-high','2020-01-15','once','high'),
  ('fa100000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','self-low', '2020-01-15','once','low'),
  ('fb1a0000-0000-0000-0000-000000000000','b1b1b1b1-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','self-b1',  '2020-01-15','once','high'),
  ('fc1a0000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','rank-a1',  '2020-01-16','once','high'),
  ('fc2a0000-0000-0000-0000-000000000000','a2a2a2a2-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','rank-a2',  '2020-01-16','once','low'),
  ('fc1b0000-0000-0000-0000-000000000000','b1b1b1b1-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','rank-b1',  '2020-01-16','once','medium'),
  ('ffff0000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','cap-fut',  '2020-01-01','once','high');
insert into public.task_instances (task_id, date, status_pct) values
  ('fa110000-0000-0000-0000-000000000000','2020-01-15',100),
  ('fa100000-0000-0000-0000-000000000000','2020-01-15',0),
  ('fb1a0000-0000-0000-0000-000000000000','2020-01-15',100),
  ('fc1a0000-0000-0000-0000-000000000000','2020-01-16',100),
  ('fc2a0000-0000-0000-0000-000000000000','2020-01-16',0),
  ('fc1b0000-0000-0000-0000-000000000000','2020-01-16',100),
  ('ffff0000-0000-0000-0000-000000000000', public.app_today() + 10, 100);

\echo '===== priority_weight: high/medium/low = 3/2/1 ====='
do $$
begin
  assert public.priority_weight('high'::public.task_priority) = 3, 'w high=3';
  assert public.priority_weight('medium'::public.task_priority) = 2, 'w medium=2';
  assert public.priority_weight('low'::public.task_priority) = 1, 'w low=1';
end $$;

\echo '===== compliance_self (a1): fórmula 75, aislamiento self, Σw=0→NULL, capado de futuro ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare r record; r2 record;
  begin
    -- fórmula: high@100 + low@0 = round(100·3/(3+1)) = 75. total/done/undone correctos.
    -- aislamiento: la instancia de b1 el mismo día NO entra (RLS self) → total=2, no 3.
    select * into r from public.compliance_self(date '2020-01-15', date '2020-01-15');
    assert r.total = 2, format('self total %s (esp 2; si fuese 3, fugó b1)', r.total);
    assert r.done = 1 and r.half = 0 and r.undone = 1, format('self d/h/u = %s/%s/%s', r.done, r.half, r.undone);
    assert r.compliance_pct = 75, format('self pct %s (esp 75 = 100·3/(3+1))', r.compliance_pct);

    -- Σw=0 (rango sin instancias) → compliance_pct NULL, total 0
    select * into r from public.compliance_self(date '2019-01-01', date '2019-01-01');
    assert r.total = 0, format('self vacío total %s', r.total);
    assert r.compliance_pct is null, format('self vacío pct %s (esp NULL)', r.compliance_pct);

    -- CAP (1): rango ENTERAMENTE futuro → least(d_end,hoy) < d_start → 0 (la instancia futura no cuenta)
    select * into r from public.compliance_self(public.app_today() + 5, public.app_today() + 30);
    assert r.total = 0, format('cap futuro total %s (esp 0; la instancia en hoy+10 no debe contar)', r.total);

    -- CAP (2): d_end futuro == d_end hoy (los días futuros no inflan el KPI)
    select * into r  from public.compliance_self(date '2020-01-01', public.app_today());
    select * into r2 from public.compliance_self(date '2020-01-01', public.app_today() + 30);
    assert r.total = r2.total, format('cap: total hoy %s vs d_end-futuro %s (deben coincidir)', r.total, r2.total);
    assert r.compliance_pct is not distinct from r2.compliance_pct, 'cap: pct hoy == pct con d_end futuro';
  end $$;
rollback;

\echo '===== compliance_ranking (auditor): rollup=agregación (NO promedio), cross-distribución, sin PII ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare pa int; pb int; ua int; uaa int; hasB1 boolean;
  begin
    -- rollup distA = 75 (agregación (3·100+1·0)/(3+1)), NO 50 (promedio de 100 y 0)
    select compliance_pct into pa from public.compliance_ranking(date '2020-01-16', date '2020-01-16')
      where grain = 'distribution' and distribution_id = 'aaaaaaaa-0000-0000-0000-000000000000';
    assert pa = 75, format('rollup distA %s (esp 75 agregación, NO 50 promedio-de-promedios)', pa);
    -- rollup distB = 100
    select compliance_pct into pb from public.compliance_ranking(date '2020-01-16', date '2020-01-16')
      where grain = 'distribution' and distribution_id = 'bbbbbbbb-0000-0000-0000-000000000000';
    assert pb = 100, format('rollup distB %s (esp 100)', pb);
    -- grano usuario: a1 = 100, a2 = 0
    select compliance_pct into ua from public.compliance_ranking(date '2020-01-16', date '2020-01-16')
      where grain = 'user' and user_id = 'a1a1a1a1-0000-0000-0000-000000000000';
    assert ua = 100, format('user a1 %s (esp 100)', ua);
    select compliance_pct into uaa from public.compliance_ranking(date '2020-01-16', date '2020-01-16')
      where grain = 'user' and user_id = 'a2a2a2a2-0000-0000-0000-000000000000';
    assert uaa = 0, format('user a2 %s (esp 0)', uaa);
    -- cross-distribución: el auditor ve a b1 (distribución B), no solo una
    select exists (
      select 1 from public.compliance_ranking(date '2020-01-16', date '2020-01-16')
      where grain = 'user' and user_id = 'b1b1b1b1-0000-0000-0000-000000000000'
    ) into hasB1;
    assert hasB1, 'auditor ve a b1 (cross-distribución)';
    -- PII: la salida no tiene columnas de título/hora por construcción (firma de la función).
  end $$;
rollback;

\echo '===== compliance_ranking (admin): ve todas las distribuciones ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare hasA boolean; hasB boolean;
  begin
    select exists (select 1 from public.compliance_ranking(date '2020-01-16', date '2020-01-16')
      where grain='distribution' and distribution_id='aaaaaaaa-0000-0000-0000-000000000000') into hasA;
    select exists (select 1 from public.compliance_ranking(date '2020-01-16', date '2020-01-16')
      where grain='distribution' and distribution_id='bbbbbbbb-0000-0000-0000-000000000000') into hasB;
    assert hasA and hasB, format('admin ve distA=%s distB=%s (esp ambas)', hasA, hasB);
  end $$;
rollback;

\echo '===== compliance_ranking (distribuidor): gate → 0 filas ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.compliance_ranking(date '2020-01-16', date '2020-01-16');
    assert n = 0, format('distribuidor NO debe ver ranking (vio %s filas) — gate fail-closed', n);
  end $$;
rollback;

\echo '===== MÉTRICAS (core 0005): compliance_self + compliance_ranking (gate, rollup, cap, PII) — VERDE ====='
