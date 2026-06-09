-- TESTS siembra de items NUEVOS al propagar (NO core) — ADR-0018. Replica el PASO 2 de propagateTemplate
-- (lib/actions/templates.ts): además de propagar campos (cubierto en 30_customized), INSERTA las tareas de
-- los template_items que un asignado ACTIVO aún no tiene. Idempotente (dedup por owner+template_item_id sobre
-- TODAS las tareas del template, incl. borradas → no resucita lo que el distribuidor quitó). Inactivos: nada.
-- Todo en una transacción con rollback → sin contaminación. start_date 2030 (disjunto, futuro → no materializa).

begin;

-- Plantilla con 3 items: c1 (el dist ya lo tiene), c2 (NUEVO → se siembra), c3 (el dist lo borró → no resucita).
insert into public.task_templates (id, name, created_by) values
  ('cc000000-0000-0000-0000-000000000000','Seed18','11111111-0000-0000-0000-000000000000');
insert into public.template_items (id, template_id, title, priority, recurrence, time_slot, duration_minutes) values
  ('cc100000-0000-0000-0000-000000000000','cc000000-0000-0000-0000-000000000000','Item ya tiene','medium','daily','09:00',30),
  ('cc200000-0000-0000-0000-000000000000','cc000000-0000-0000-0000-000000000000','Item NUEVO','high','daily','10:00',30),
  ('cc300000-0000-0000-0000-000000000000','cc000000-0000-0000-0000-000000000000','Item borrado por dist','low','daily','11:00',30);

-- Asignados: a2 ACTIVO, a3 INACTIVO (active=false). Ambos distribuidores de la distribución A.
insert into public.template_assignments (template_id, user_id, assigned_by, active) values
  ('cc000000-0000-0000-0000-000000000000','a2a2a2a2-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000', true),
  ('cc000000-0000-0000-0000-000000000000','a3a3a3a3-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000', false);

-- a2 ya tiene tarea para c1 (viva) y para c3 (borrada por el propio distribuidor).
insert into public.tasks (id, owner_user_id, distribution_id, title, start_date, recurrence, template_id, template_item_id) values
  ('ccaa0001-0000-0000-0000-000000000000','a2a2a2a2-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Tengo c1','2030-01-01','daily','cc000000-0000-0000-0000-000000000000','cc100000-0000-0000-0000-000000000000'),
  ('ccaa0003-0000-0000-0000-000000000000','a2a2a2a2-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Tenia c3','2030-01-01','daily','cc000000-0000-0000-0000-000000000000','cc300000-0000-0000-0000-000000000000');
update public.tasks set deleted_at='2030-01-02 00:00:00+00' where id='ccaa0003-0000-0000-0000-000000000000';

\echo '===== SIEMBRA (ADR-0018): items nuevos a asignados ACTIVOS; idempotente; no resucita borradas; salta inactivos ====='
do $$
begin
  -- ── simula propagateTemplate PASO 2 (siembra) ──────────────────────────────
  insert into public.tasks (owner_user_id, distribution_id, title, category_id, priority, recurrence,
                            start_date, time_slot, duration_minutes, origin, assigned_by_user_id,
                            template_id, template_item_id)
  select u.id, u.distribution_id, ti.title, ti.category_id, ti.priority, ti.recurrence,
         '2030-01-01', ti.time_slot, ti.duration_minutes, 'superior', '11111111-0000-0000-0000-000000000000',
         ti.template_id, ti.id
  from public.template_items ti
  join public.template_assignments ta on ta.template_id = ti.template_id and ta.active
  join public.users u on u.id = ta.user_id and u.role = 'distributor' and u.distribution_id is not null
  where ti.template_id = 'cc000000-0000-0000-0000-000000000000'
    and not exists (select 1 from public.tasks t
                    where t.template_id = ti.template_id and t.owner_user_id = u.id and t.template_item_id = ti.id);

  -- 1) c2 (nuevo) sembrado al asignado ACTIVO
  assert (select count(*) from public.tasks
          where owner_user_id='a2a2a2a2-0000-0000-0000-000000000000'
            and template_item_id='cc200000-0000-0000-0000-000000000000' and deleted_at is null) = 1,
    'c2 NUEVO sembrado a asignado activo';
  -- 2) c1 NO duplicado (ya lo tenía)
  assert (select count(*) from public.tasks
          where owner_user_id='a2a2a2a2-0000-0000-0000-000000000000'
            and template_item_id='cc100000-0000-0000-0000-000000000000') = 1,
    'c1 existente NO duplicado';
  -- 3) c3 borrado por el dist NO resucita (0 vivas) y la borrada sigue intacta (no se toca)
  assert (select count(*) from public.tasks
          where owner_user_id='a2a2a2a2-0000-0000-0000-000000000000'
            and template_item_id='cc300000-0000-0000-0000-000000000000' and deleted_at is null) = 0,
    'c3 borrado por el dist NO resucita';
  assert (select count(*) from public.tasks
          where owner_user_id='a2a2a2a2-0000-0000-0000-000000000000'
            and template_item_id='cc300000-0000-0000-0000-000000000000') = 1,
    'la c3 borrada sigue ahí (no se toca)';
  -- 4) asignado INACTIVO no recibe nada
  assert (select count(*) from public.tasks
          where owner_user_id='a3a3a3a3-0000-0000-0000-000000000000'
            and template_id='cc000000-0000-0000-0000-000000000000') = 0,
    'asignado inactivo no recibe siembra';

  -- ── re-siembra: IDEMPOTENTE (mismo SELECT) ─────────────────────────────────
  insert into public.tasks (owner_user_id, distribution_id, title, category_id, priority, recurrence,
                            start_date, time_slot, duration_minutes, origin, assigned_by_user_id,
                            template_id, template_item_id)
  select u.id, u.distribution_id, ti.title, ti.category_id, ti.priority, ti.recurrence,
         '2030-01-01', ti.time_slot, ti.duration_minutes, 'superior', '11111111-0000-0000-0000-000000000000',
         ti.template_id, ti.id
  from public.template_items ti
  join public.template_assignments ta on ta.template_id = ti.template_id and ta.active
  join public.users u on u.id = ta.user_id and u.role = 'distributor' and u.distribution_id is not null
  where ti.template_id = 'cc000000-0000-0000-0000-000000000000'
    and not exists (select 1 from public.tasks t
                    where t.template_id = ti.template_id and t.owner_user_id = u.id and t.template_item_id = ti.id);

  assert (select count(*) from public.tasks
          where owner_user_id='a2a2a2a2-0000-0000-0000-000000000000'
            and template_item_id='cc200000-0000-0000-0000-000000000000' and deleted_at is null) = 1,
    'idempotente: la 2a siembra no duplica c2';
end $$;

rollback;
\echo '===== 36_propagate_seed OK ====='
