-- TESTS BI (NO core) — ADR-0013 / migración 0006. Fixtures en 2021 (año LIBRE: ningún otro test usa
-- 2021 → sin contaminación cruzada), inmunes a app_today(), salvo el capado que usa app_today()±N.
-- 2021-01-04 = lunes; 2021-02-01 = lunes. Roles vía jwt + set role (como 23–25).

-- ── Categorías (global) para el breakdown ────────────────────────────────────
insert into public.task_categories (id, name, scope, owner_user_id, created_by) values
  ('c1c10000-0000-0000-0000-000000000000','Ventas','global', null, '11111111-0000-0000-0000-000000000000'),
  ('c2c20000-0000-0000-0000-000000000000','Admin', 'global', null, '11111111-0000-0000-0000-000000000000');

-- ── Tareas (a1=distA, b1=distB) ───────────────────────────────────────────────
-- series: a1 medium (w=2) en 2021-01-04(lun), 2021-01-05(mar), 2021-02-01(lun); b1 medium 2021-01-04 (aislamiento).
-- cap: a1 medium con instancia en app_today()+10. breakdown: dd (prioridad, marzo), ca/cb (categoría, abril).
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, priority, category_id) values
  ('aa060000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','s04','2021-01-04','once','medium', null),
  ('aa070000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','s05','2021-01-05','once','medium', null),
  ('aa020300-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','sfeb','2021-02-01','once','medium', null),
  ('bb060000-0000-0000-0000-000000000000','b1b1b1b1-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','b04','2021-01-04','once','medium', null),
  ('aafff000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','cap','2021-01-01','once','medium', null),
  ('dd000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','prio','2021-03-01','once','low', null),
  ('ca000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','catq','2021-04-01','once','medium','c1c10000-0000-0000-0000-000000000000'),
  ('cb000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','catr','2021-04-02','once','medium', null);

-- Instancias (el trigger pone owner/distribution desde el task). Overrides donde toca.
insert into public.task_instances (task_id, date, status_pct) values
  ('aa060000-0000-0000-0000-000000000000','2021-01-04',100),
  ('aa070000-0000-0000-0000-000000000000','2021-01-05',0),
  ('aa020300-0000-0000-0000-000000000000','2021-02-01',100),
  ('bb060000-0000-0000-0000-000000000000','2021-01-04',0),
  ('cb000000-0000-0000-0000-000000000000','2021-04-02',50);
insert into public.task_instances (task_id, date, status_pct) values
  ('aafff000-0000-0000-0000-000000000000', public.app_today() + 10, 100);
-- override de prioridad: task 'low' + instancia 'high' → debe contar como high
insert into public.task_instances (task_id, date, status_pct, priority) values
  ('dd000000-0000-0000-0000-000000000000','2021-03-01',100,'high');
-- override de categoría: task C1 (Ventas) + instancia C2 (Admin) → debe contar como Admin
insert into public.task_instances (task_id, date, status_pct, category_id) values
  ('ca000000-0000-0000-0000-000000000000','2021-04-01',100,'c2c20000-0000-0000-0000-000000000000');

\echo '===== compliance_series/breakdown: gate, buckets, override, whitelist, cap (auditor) ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare p int; n int; t1 int; t2 int; lbl text;
  begin
    -- SERIES day (p_user=a1): 3 buckets con pct correcto
    select compliance_pct into p from public.compliance_series(date '2021-01-04', date '2021-02-28','day','a1a1a1a1-0000-0000-0000-000000000000') where bucket_start='2021-01-04';
    assert p = 100, format('day 01-04 pct %s', p);
    select compliance_pct into p from public.compliance_series(date '2021-01-04', date '2021-02-28','day','a1a1a1a1-0000-0000-0000-000000000000') where bucket_start='2021-01-05';
    assert p = 0, format('day 01-05 pct %s', p);
    select count(*) into n from public.compliance_series(date '2021-01-04', date '2021-02-28','day','a1a1a1a1-0000-0000-0000-000000000000');
    assert n = 3, format('day buckets %s (esp 3)', n);

    -- SERIES week: lunes 2021-01-04 agrega 04(100)+05(0) medio → (100·2+0·2)/4 = 50
    select compliance_pct into p from public.compliance_series(date '2021-01-04', date '2021-02-28','week','a1a1a1a1-0000-0000-0000-000000000000') where bucket_start='2021-01-04';
    assert p = 50, format('week 01-04 (lunes) pct %s (esp 50)', p);
    select compliance_pct into p from public.compliance_series(date '2021-01-04', date '2021-02-28','week','a1a1a1a1-0000-0000-0000-000000000000') where bucket_start='2021-02-01';
    assert p = 100, format('week 02-01 pct %s', p);

    -- SERIES month: enero 50, febrero 100
    select compliance_pct into p from public.compliance_series(date '2021-01-01', date '2021-02-28','month','a1a1a1a1-0000-0000-0000-000000000000') where bucket_start='2021-01-01';
    assert p = 50, format('month ene pct %s', p);
    select compliance_pct into p from public.compliance_series(date '2021-01-01', date '2021-02-28','month','a1a1a1a1-0000-0000-0000-000000000000') where bucket_start='2021-02-01';
    assert p = 100, format('month feb pct %s', p);

    -- AISLAMIENTO p_user: día 01-04, p_user=a1 → total 1 pct 100; p_user=null → total 2 (a1+b1) pct 50
    select total, compliance_pct into t1, p from public.compliance_series(date '2021-01-04', date '2021-01-04','day','a1a1a1a1-0000-0000-0000-000000000000') where bucket_start='2021-01-04';
    assert t1 = 1 and p = 100, format('p_user=a1 total %s pct %s', t1, p);
    select total, compliance_pct into t2, p from public.compliance_series(date '2021-01-04', date '2021-01-04','day', null) where bucket_start='2021-01-04';
    assert t2 = 2 and p = 50, format('p_user=null total %s pct %s (esp 2/50, incluye b1)', t2, p);

    -- CAP: rango futuro → 0; d_end futuro == d_end app_today() (la instancia en +10 no añade bucket)
    select count(*) into n from public.compliance_series(public.app_today()+5, public.app_today()+30,'day','a1a1a1a1-0000-0000-0000-000000000000');
    assert n = 0, format('cap rango futuro %s (esp 0)', n);
    select count(*) into t1 from public.compliance_series(date '2021-01-04', public.app_today(),'day','a1a1a1a1-0000-0000-0000-000000000000');
    select count(*) into t2 from public.compliance_series(date '2021-01-04', public.app_today()+30,'day','a1a1a1a1-0000-0000-0000-000000000000');
    assert t1 = t2, format('cap: buckets hoy %s vs futuro %s', t1, t2);

    -- vacío → 0 filas (sin fila espuria con pct 0/NULL)
    select count(*) into n from public.compliance_series(date '2018-01-01', date '2018-01-31','day','a1a1a1a1-0000-0000-0000-000000000000');
    assert n = 0, format('rango vacío %s (esp 0)', n);

    -- BREAKDOWN priority (marzo): override de instancia gana → 'high', NO 'low'
    select compliance_pct into p from public.compliance_breakdown(date '2021-03-01', date '2021-03-31','priority','a1a1a1a1-0000-0000-0000-000000000000') where key='high';
    assert p = 100, format('breakdown priority high pct %s', p);
    assert not exists (select 1 from public.compliance_breakdown(date '2021-03-01', date '2021-03-31','priority','a1a1a1a1-0000-0000-0000-000000000000') where key='low'),
      'override prioridad: NO debe aparecer low';

    -- BREAKDOWN category (abril): override → Admin (C2); task sin categoría → '∅'/'Sin categoría'; NO Ventas (C1)
    select label into lbl from public.compliance_breakdown(date '2021-04-01', date '2021-04-30','category','a1a1a1a1-0000-0000-0000-000000000000') where key='c2c20000-0000-0000-0000-000000000000';
    assert lbl = 'Admin', format('override categoría label %s (esp Admin)', lbl);
    assert exists (select 1 from public.compliance_breakdown(date '2021-04-01', date '2021-04-30','category','a1a1a1a1-0000-0000-0000-000000000000') where key='∅' and label='Sin categoría'),
      'categoría null → ∅/Sin categoría';
    assert not exists (select 1 from public.compliance_breakdown(date '2021-04-01', date '2021-04-30','category','a1a1a1a1-0000-0000-0000-000000000000') where key='c1c10000-0000-0000-0000-000000000000'),
      'override categoría: NO debe aparecer Ventas (C1)';

    -- WHITELIST: bucket inválido → excepción
    begin
      perform count(*) from public.compliance_series(date '2021-01-01', date '2021-01-31','year');
      raise exception 'XFAIL: bucket year no rechazado';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
    -- WHITELIST: dimension inválida → excepción
    begin
      perform count(*) from public.compliance_breakdown(date '2021-01-01', date '2021-01-31','owner');
      raise exception 'XFAIL: dimension owner no rechazada';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;

\echo '===== gate: distribuidor → 0 filas en series y breakdown ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.compliance_series(date '2021-01-04', date '2021-02-28','day');
    assert n = 0, format('distribuidor series %s filas (esp 0)', n);
    select count(*) into n from public.compliance_breakdown(date '2021-03-01', date '2021-03-31','priority');
    assert n = 0, format('distribuidor breakdown %s filas (esp 0)', n);
  end $$;
rollback;

\echo '===== gate: admin ve series (cross-distribución p_user=null) ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare t int;
  begin
    select total into t from public.compliance_series(date '2021-01-04', date '2021-01-04','day', null) where bucket_start='2021-01-04';
    assert t = 2, format('admin p_user=null total %s (esp 2: a1+b1)', t);
  end $$;
rollback;

\echo '===== BI (core 0006): series + breakdown (gate, buckets, override, whitelist, cap, aislamiento) — VERDE ====='
