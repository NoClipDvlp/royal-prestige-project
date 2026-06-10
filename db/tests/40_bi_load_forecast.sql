-- TESTS BI ADR-0030 (migración 0019): task_load_forecast (carga futura) + compliance_breakdown drill.
-- Aislamiento: el harness comparte DB y algunos tests dejan tareas committed → distA/distB están "sucias".
-- Por eso este test crea una DISTRIBUCIÓN FRESCA (distC) con sus propios distribuidores (c1,c2) y tareas →
-- conteos deterministas. El gate de rol se prueba con auditor/distribuidor/role=null.

begin;
  -- ── SETUP como ADMIN (para pasar el guardián de escalada al asignar rol/distribución) ──
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  insert into public.distributions (id, name) values ('cccccccc-0000-0000-0000-000000000000', 'Distribución C');
  insert into public.task_categories (id, name, scope, created_by)
    values ('ca7e0000-0000-0000-0000-000000000000', 'Carga Test', 'global', '11111111-0000-0000-0000-000000000000');
  -- crear c1/c2: insertar auth.users dispara handle_new_user (perfil role=null) → luego asignar rol/distribución
  insert into auth.users (id, email) values
    ('c1c1c1c1-0000-0000-0000-000000000000', 'c1@rc.test'),
    ('c2c2c2c2-0000-0000-0000-000000000000', 'c2@rc.test');
  update public.users set role = 'distributor', distribution_id = 'cccccccc-0000-0000-0000-000000000000', full_name = 'Dist C1'
    where id = 'c1c1c1c1-0000-0000-0000-000000000000';
  update public.users set role = 'distributor', distribution_id = 'cccccccc-0000-0000-0000-000000000000', full_name = 'Dist C2'
    where id = 'c2c2c2c2-0000-0000-0000-000000000000';
  -- FUTURO (forecast): c1 daily(cat Carga Test) + c2 once(2031-03-02). PASADO (breakdown): c1 once 2026-05-15 al 100%.
  insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, category_id) values
    ('fc000001-0000-0000-0000-000000000000','c1c1c1c1-0000-0000-0000-000000000000','cccccccc-0000-0000-0000-000000000000','daily C1','2020-01-01','daily','ca7e0000-0000-0000-0000-000000000000'),
    ('fc000002-0000-0000-0000-000000000000','c2c2c2c2-0000-0000-0000-000000000000','cccccccc-0000-0000-0000-000000000000','once C2','2031-03-02','once', null),
    ('fc000003-0000-0000-0000-000000000000','c1c1c1c1-0000-0000-0000-000000000000','cccccccc-0000-0000-0000-000000000000','past C1','2026-05-15','once', null);
  insert into public.task_instances (task_id, date, status_pct) values
    ('fc000003-0000-0000-0000-000000000000','2026-05-15', 100);

  \echo '===== FORECAST: auditor — carga por distribución/distribuidor/categoría (distC determinista) ====='
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    -- distC = c1 daily(3 días) + c2 once(1) = 4
    assert (select load from public.task_load_forecast('2031-03-01','2031-03-03','distribution')
            where key = 'cccccccc-0000-0000-0000-000000000000') = 4, 'distC carga futura = 4';
    assert (select load from public.task_load_forecast('2031-03-01','2031-03-03','distributor', null, 'cccccccc-0000-0000-0000-000000000000')
            where key = 'c1c1c1c1-0000-0000-0000-000000000000') = 3, 'c1 carga = 3';
    assert (select load from public.task_load_forecast('2031-03-01','2031-03-03','distributor', null, 'cccccccc-0000-0000-0000-000000000000')
            where key = 'c2c2c2c2-0000-0000-0000-000000000000') = 1, 'c2 carga = 1';
    assert (select load from public.task_load_forecast('2031-03-01','2031-03-03','category')
            where key = 'ca7e0000-0000-0000-0000-000000000000') = 3, 'categoría Carga Test = 3';
  end $$;

  \echo '===== FORECAST: el distribuidor ve SOLO su carga (ignora p_user ajeno) ====='
  select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    -- c1 pide p_user=c2 pero el gate lo fuerza a lo suyo → su Carga Test (3), nunca la de c2
    assert (select load from public.task_load_forecast('2031-03-01','2031-03-03','category', 'c2c2c2c2-0000-0000-0000-000000000000')
            where key = 'ca7e0000-0000-0000-0000-000000000000') = 3, 'c1 = solo su carga (3)';
  end $$;

  \echo '===== FORECAST: role=null → 0 filas ====='
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    assert (select count(*) from public.task_load_forecast('2031-03-01','2031-03-03','category')) = 0, 'role=null sin carga';
  end $$;

  \echo '===== BREAKDOWN drill: auditor por distribución/distribuidor + compat 4-args (distC determinista) ====='
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    assert (select total from public.compliance_breakdown('2026-05-15','2026-05-15','distribution')
            where key = 'cccccccc-0000-0000-0000-000000000000') = 1, 'distC breakdown total=1';
    assert (select total from public.compliance_breakdown('2026-05-15','2026-05-15','distributor', null, 'cccccccc-0000-0000-0000-000000000000')
            where key = 'c1c1c1c1-0000-0000-0000-000000000000') = 1, 'c1 dentro de distC total=1';
    -- compat: la llamada de 4 args (category, p_user) sigue válida (p_distribution default null)
    assert (select count(*) from public.compliance_breakdown('2026-05-15','2026-05-15','category', 'c1c1c1c1-0000-0000-0000-000000000000')) >= 1,
      'compat 4-args (category, p_user) sigue funcionando';
  end $$;

  \echo '===== BREAKDOWN: el distribuidor NO accede (gate admin/auditor) ====='
  select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    assert (select count(*) from public.compliance_breakdown('2026-05-15','2026-05-15','category')) = 0,
      'distribuidor no accede al breakdown';
  end $$;
rollback;
\echo '===== 40_bi_load_forecast OK ====='
