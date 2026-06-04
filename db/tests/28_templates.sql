-- TESTS PLANTILLAS Fase 1 (NO core) — ADR-0015 / migración 0008. Estructura + RLS.
-- Fixtures en 2023 (año LIBRE, sin colisión con otros tests; DEBT-0012). Roles vía jwt + set role.

-- ── Fixtures (superusuario → bypass RLS) ─────────────────────────────────────
insert into public.task_templates (id, name, description, created_by) values
  ('a7000000-0000-0000-0000-000000000000','Onboarding','Plan de arranque','11111111-0000-0000-0000-000000000000');
insert into public.template_items (id, template_id, title, priority, recurrence, time_slot, duration_minutes) values
  ('a7100000-0000-0000-0000-000000000000','a7000000-0000-0000-0000-000000000000','Llamar','high','daily','09:00',60);
insert into public.template_assignments (template_id, user_id, assigned_by) values
  ('a7000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000');
-- Tarea "materializada" de la plantilla (owner a1). once + fecha pasada → sin instancia automática.
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, template_id, template_item_id) values
  ('a7700000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Llamar','2023-01-02','once',
   'a7000000-0000-0000-0000-000000000000','a7100000-0000-0000-0000-000000000000');

\echo '===== estructura: columnas nuevas en tasks + CHECK de duración en template_items ====='
do $$
begin
  -- provenance presente
  assert exists (select 1 from public.tasks where id='a7700000-0000-0000-0000-000000000000'
    and template_id='a7000000-0000-0000-0000-000000000000' and template_item_id='a7100000-0000-0000-0000-000000000000'),
    'task con template_id/template_item_id';
  -- customized_at es settable (la Fase 2 lo usará); arranca NULL = intacta
  assert (select customized_at from public.tasks where id='a7700000-0000-0000-0000-000000000000') is null, 'customized_at nace NULL (intacta)';
  update public.tasks set customized_at = timestamptz '2023-01-05 00:00:00+00' where id='a7700000-0000-0000-0000-000000000000';
  assert (select customized_at from public.tasks where id='a7700000-0000-0000-0000-000000000000') is not null, 'customized_at settable';

  -- CHECK de duración del item (espejo 0004, sin wrap): 21:00+180 = 24:00 > 22:00 → debe fallar
  begin
    insert into public.template_items (template_id, title, time_slot, duration_minutes)
      values ('a7000000-0000-0000-0000-000000000000','dur mala','21:00',180);
    raise exception 'XFAIL: item con 21:00+180 aceptado';
  exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
  end;
end $$;

\echo '===== RLS: admin CRUD de plantillas ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.task_templates where deleted_at is null;
    assert n >= 1, format('admin ve plantillas (%s)', n);
    select count(*) into n from public.template_items;        assert n >= 1, 'admin ve items';
    select count(*) into n from public.template_assignments;  assert n >= 1, 'admin ve assignments';
    -- admin puede crear (with check admin)
    insert into public.task_templates (name, created_by) values ('Otra', '11111111-0000-0000-0000-000000000000');
  end $$;
rollback;

\echo '===== RLS: distribuidor NO ve plantillas; NO puede crear; SÍ ve su tarea materializada ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.task_templates;       assert n = 0, format('distribuidor 0 plantillas (vio %s)', n);
    select count(*) into n from public.template_items;       assert n = 0, format('distribuidor 0 items (vio %s)', n);
    select count(*) into n from public.template_assignments; assert n = 0, format('distribuidor 0 assignments (vio %s)', n);
    -- ve su tarea materializada vía la RLS EXISTENTE de tasks (owner=self)
    select count(*) into n from public.tasks where id='a7700000-0000-0000-0000-000000000000';
    assert n = 1, 'distribuidor ve su tarea de plantilla (RLS tasks self)';
    -- INSERT de plantilla denegado (with check admin)
    begin
      insert into public.task_templates (name, created_by) values ('hack','a1a1a1a1-0000-0000-0000-000000000000');
      raise exception 'XFAIL: distribuidor pudo insertar plantilla';
    exception when others then if sqlerrm like 'XFAIL%' then raise; end if;
    end;
  end $$;
rollback;

\echo '===== RLS: auditor NO ve plantillas; b1 NO ve la tarea de a1 ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.task_templates; assert n = 0, format('auditor 0 plantillas (vio %s)', n);
  end $$;
rollback;
begin;
  select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.tasks where id='a7700000-0000-0000-0000-000000000000';
    assert n = 0, 'b1 NO ve la tarea de plantilla de a1 (RLS tasks self)';
  end $$;
rollback;

\echo '===== PLANTILLAS Fase 1 (core 0008): estructura + RLS admin-only + tasks self — VERDE ====='
