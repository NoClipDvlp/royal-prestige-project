-- TESTS DE AISLAMIENTO (NO core). ON_ERROR_STOP=1 → cualquier ASSERT/excepción aborta ≠0.
-- Identidad simulada: set_config('request.jwt.claims', ...) + set local role authenticated.
-- service_role/superusuario para probar constraints y append-only (bypass RLS, triggers siguen).

\echo '===== (a) Aislamiento del distributor A (no ve la distribución B) ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.tasks;
    assert n = 1, format('distA1 ve %s tasks (esperaba 1, solo la suya)', n);
    select count(*) into n from public.tasks where distribution_id = 'bbbbbbbb-0000-0000-0000-000000000000';
    assert n = 0, 'distA1 NO debe ver tasks de la distribución B';

    select count(*) into n from public.task_instances;
    assert n = 1, format('distA1 ve %s instances (esperaba 1)', n);
    select count(*) into n from public.task_instances where distribution_id = 'bbbbbbbb-0000-0000-0000-000000000000';
    assert n = 0, 'distA1 NO debe ver instances de B';

    select count(*) into n from public.metric_snapshots;
    assert n = 1, format('distA1 ve %s snapshots (esperaba 1, el propio)', n);
    select count(*) into n from public.metric_snapshots where user_id = 'b1b1b1b1-0000-0000-0000-000000000000';
    assert n = 0, 'distA1 NO debe ver métricas de B';

    select count(*) into n from public.distributions;
    assert n = 1, format('distA1 ve %s distribuciones (esperaba 1, la suya)', n);
  end $$;
rollback;

\echo '===== (a-bonus) distributor NO puede escalar su propio rol ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    begin
      update public.users set role = 'admin' where id = (select auth.uid());
      raise exception 'XFAIL: distA1 logró escalar su rol a admin';
    exception when others then
      if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;

\echo '===== (b) role=null no lee NINGUNA tabla de negocio (solo su fila en users) ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.tasks;                    assert n = 0, 'role=null no debe leer tasks';
    select count(*) into n from public.task_instances;           assert n = 0, 'role=null no debe leer task_instances';
    select count(*) into n from public.metric_snapshots;         assert n = 0, 'role=null no debe leer metric_snapshots';
    select count(*) into n from public.task_categories;          assert n = 0, 'role=null no debe leer task_categories';
    select count(*) into n from public.distributions;            assert n = 0, 'role=null no debe leer distributions';
    select count(*) into n from public.distribution_owners;      assert n = 0, 'role=null no debe leer distribution_owners';
    select count(*) into n from public.org_hierarchy;            assert n = 0, 'role=null no debe leer org_hierarchy';
    select count(*) into n from public.calendar_links;           assert n = 0, 'role=null no debe leer calendar_links';
    select count(*) into n from public.calendar_sync_conflicts;  assert n = 0, 'role=null no debe leer calendar_sync_conflicts';
    select count(*) into n from public.notifications;            assert n = 0, 'role=null no debe leer notifications';
    -- única excepción: su PROPIA fila en users
    select count(*) into n from public.users;                    assert n = 1, format('role=null ve %s users (esperaba 1, la suya)', n);
    select count(*) into n from public.users where id <> (select auth.uid());
    assert n = 0, 'role=null no debe ver otras filas de users';
  end $$;
rollback;

\echo '===== (c) auditor: métricas de TODAS, sin tasks/instances, sin escritura ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.metric_snapshots;
    assert n = 2, format('auditor ve %s snapshots (esperaba 2: A y B)', n);
    select count(*) into n from public.tasks;
    assert n = 0, 'auditor NO debe leer tasks (sin drill-down)';
    select count(*) into n from public.task_instances;
    assert n = 0, 'auditor NO debe leer task_instances (sin drill-down)';

    -- no escribe: UPDATE/DELETE → 0 filas (sin policy que matchee)
    with u as (update public.tasks set title = title returning 1) select count(*) into n from u;
    assert n = 0, 'auditor NO debe poder UPDATE tasks';
    with d as (delete from public.tasks returning 1) select count(*) into n from d;
    assert n = 0, 'auditor NO debe poder DELETE tasks';

    -- INSERT en metric_snapshots → rechazado por RLS (with check exige admin)
    begin
      insert into public.metric_snapshots(user_id, period, period_start, period_end, compliance_pct)
        values ('a1a1a1a1-0000-0000-0000-000000000000','monthly','2026-04-01','2026-04-30', 99);
      raise exception 'XFAIL: auditor logró INSERT en metric_snapshots';
    exception when others then
      if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;

\echo '===== (d) constraints duras: 3 owners, estado {0,50,100}, snapshots append-only ====='
-- d.1 cuarto owner por CHECK(slot 1..3)
begin;
  do $$
  begin
    begin
      insert into public.distribution_owners(distribution_id, user_id, owner_slot)
        values ('aaaaaaaa-0000-0000-0000-000000000000','a4a4a4a4-0000-0000-0000-000000000000', 4);
      raise exception 'XFAIL: se aceptó owner_slot=4';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;
-- d.2 cuarto owner por UNIQUE(distribution_id, owner_slot) reusando slot 3
begin;
  do $$
  begin
    begin
      insert into public.distribution_owners(distribution_id, user_id, owner_slot)
        values ('aaaaaaaa-0000-0000-0000-000000000000','a4a4a4a4-0000-0000-0000-000000000000', 3);
      raise exception 'XFAIL: se aceptó un 4º owner reusando slot 3';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;
-- d.3 estado fuera de {0,50,100}
begin;
  do $$
  begin
    begin
      insert into public.task_instances(task_id, date, status_pct)
        values ('aaaa1111-0000-0000-0000-000000000000','2026-06-02', 33);
      raise exception 'XFAIL: se aceptó status_pct=33';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;
-- d.4 snapshot append-only: ni service_role (bypass RLS) puede UPDATE/DELETE
begin;
  set local role service_role;
  do $$
  begin
    begin
      update public.metric_snapshots set compliance_pct = 1 where user_id = 'a1a1a1a1-0000-0000-0000-000000000000';
      raise exception 'XFAIL: se permitió UPDATE de metric_snapshots';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
    begin
      delete from public.metric_snapshots where user_id = 'a1a1a1a1-0000-0000-0000-000000000000';
      raise exception 'XFAIL: se permitió DELETE de metric_snapshots';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;

\echo '===== TODOS LOS TESTS DE AISLAMIENTO: VERDE ====='
