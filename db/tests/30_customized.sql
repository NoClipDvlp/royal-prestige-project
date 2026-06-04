-- TESTS Fase 2c (NO core) — ADR-0016 / migración 0010 (trigger mark_task_customized) + propagación.
-- Fixtures en 2024 (año LIBRE; DEBT-0012). Roles vía jwt + set role.

-- ── Fixtures (superusuario → bypass RLS) ─────────────────────────────────────
insert into public.task_templates (id, name, created_by) values
  ('b0000000-0000-0000-0000-000000000000','Tpl2c','11111111-0000-0000-0000-000000000000');
insert into public.template_items (id, template_id, title, priority, recurrence, time_slot, duration_minutes) values
  ('b1000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000000','NUEVO','high','daily','08:00',30);
insert into public.template_assignments (template_id, user_id, assigned_by) values
  ('b0000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000');

-- Tareas de a1 (once 2024-01-02 → sin instancia automática). Algunas vinculadas (template_item_id=b1).
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, template_id, template_item_id) values
  ('b9000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','T9','2024-01-02','once','b0000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000'),
  ('ba000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','TA','2024-01-02','once','b0000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000'),
  ('bb000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','TB','2024-01-02','once','b0000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000'),
  ('bc000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','TC','2024-01-02','once','b0000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000'),
  ('b8000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','T8','2024-01-02','once', null, null),
  ('b7000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Orig','2024-01-02','once','b0000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000'),
  ('b7200000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Borrada','2024-01-02','once','b0000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000');
-- customizada (customized_at set) y borrada (deleted_at set) — la propagación las salta
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, template_id, template_item_id, customized_at) values
  ('b7100000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Mio','2024-01-02','once','b0000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000000','2024-01-01 00:00:00+00');
update public.tasks set deleted_at = '2024-01-01 00:00:00+00' where id='b7200000-0000-0000-0000-000000000000';
-- instancia sobre b7000000 para verificar que la propagación NO toca task_instances (status)
insert into public.task_instances (task_id, date, status_pct) values ('b7000000-0000-0000-0000-000000000000','2024-01-02',50);

\echo '===== trigger: DISTRIBUIDOR edita definición → customized_at set ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    update public.tasks set title = 'T9 editada' where id='b9000000-0000-0000-0000-000000000000';
    assert (select customized_at from public.tasks where id='b9000000-0000-0000-0000-000000000000') is not null,
      'distribuidor edita def → customized_at set';
    -- col NO-definición (deleted_at) → NO marca
    update public.tasks set deleted_at = now() where id='bb000000-0000-0000-0000-000000000000';
    assert (select customized_at from public.tasks where id='bb000000-0000-0000-0000-000000000000') is null,
      'edita col NO-definición → NO marca';
    -- task SIN template_item_id → NO marca
    update public.tasks set title = 'T8 ed' where id='b8000000-0000-0000-0000-000000000000';
    assert (select customized_at from public.tasks where id='b8000000-0000-0000-0000-000000000000') is null,
      'task sin template_item_id → NO marca';
  end $$;
rollback;

\echo '===== GATE (lo crítico): ADMIN edita misma col → NO marca ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    update public.tasks set title = 'TA admin' where id='ba000000-0000-0000-0000-000000000000';
    assert (select customized_at from public.tasks where id='ba000000-0000-0000-0000-000000000000') is null,
      'admin edita def → NO marca (gate por rol)';
  end $$;
rollback;

\echo '===== GATE: JOB (service_role / rol null) edita → NO marca ====='
begin;
  set local role service_role;  -- bypassrls + sin jwt → app_current_role() null (como el cron)
  do $$
  begin
    update public.tasks set title = 'TC job' where id='bc000000-0000-0000-0000-000000000000';
    assert (select customized_at from public.tasks where id='bc000000-0000-0000-0000-000000000000') is null,
      'job (rol null) → NO marca (gate)';
  end $$;
rollback;

\echo '===== propagación (admin): solo NO-customizadas/NO-borradas/activas; NUNCA task_instances; idempotente ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare st smallint;
  begin
    -- simula propagateTemplate (UPDATE de la def del item a las tasks vinculadas elegibles de owners activos)
    update public.tasks t set title='NUEVO', priority='high'
    where t.template_item_id='b1000000-0000-0000-0000-000000000000'
      and t.customized_at is null and t.deleted_at is null
      and t.owner_user_id in (select user_id from public.template_assignments
                              where template_id='b0000000-0000-0000-0000-000000000000' and active);
    assert (select title from public.tasks where id='b7000000-0000-0000-0000-000000000000') = 'NUEVO', 'propaga a no-customizada';
    assert (select title from public.tasks where id='b7100000-0000-0000-0000-000000000000') = 'Mio', 'salta customizada';
    assert (select title from public.tasks where id='b7200000-0000-0000-0000-000000000000') = 'Borrada', 'salta borrada';
    -- la propagación (admin) NO auto-marca → la 2ª propagación seguiría viéndola
    assert (select customized_at from public.tasks where id='b7000000-0000-0000-0000-000000000000') is null,
      'propagación (admin) NO contamina customized_at';
    -- task_instances INTACTO (KPI)
    select status_pct into st from public.task_instances where task_id='b7000000-0000-0000-0000-000000000000' and date='2024-01-02';
    assert st = 50, format('task_instances.status intacto (fue %s)', st);
    -- idempotente: 2ª pasada, sigue sin marcar
    update public.tasks t set title='NUEVO', priority='high'
    where t.template_item_id='b1000000-0000-0000-0000-000000000000'
      and t.customized_at is null and t.deleted_at is null
      and t.owner_user_id in (select user_id from public.template_assignments
                              where template_id='b0000000-0000-0000-0000-000000000000' and active);
    assert (select customized_at from public.tasks where id='b7000000-0000-0000-0000-000000000000') is null, 'idempotente: sigue sin marcar';
  end $$;
rollback;

\echo '===== FASE 2C (core 0010): trigger gateado por rol + propagación no-destructiva — VERDE ====='
