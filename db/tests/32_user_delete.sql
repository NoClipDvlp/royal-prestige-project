-- TESTS borrado de usuario (NO core) — ADR-0017 / migración 0011. FKs → users(id).
-- Fixtures PROPIAS (año 2027, libre; DEBT-0012) con IDs hex frescos → el test las BORRA sin tocar otras fixtures.
-- Se borra por el camino de PROD: delete auth.users → cascade public.users → FKs corregidas.

-- ── Fixtures (superusuario) ──────────────────────────────────────────────────
-- Este test corre DESPUÉS de 0002: el trigger handle_new_user crearía public.users (role=null) y el
-- trigger forbid_self_privilege_escalation bloquearía fijar el rol por UPDATE sin sesión admin. Por eso
-- montamos las fixtures con `session_replication_role = replica` (silencia triggers de usuario Y acciones
-- FK durante el setup), insertamos public.users DIRECTO (como 10_fixtures), y reactivamos antes del borrado.
set session_replication_role = replica;

insert into auth.users(id) values
  ('ad000000-0000-0000-0000-000000000000'),
  ('dd000000-0000-0000-0000-000000000000');
insert into distributions(id, name) values
  ('d5000000-0000-0000-0000-000000000000','Dist Borrado');
insert into public.users(id, full_name, email, role, distribution_id) values
  ('ad000000-0000-0000-0000-000000000000','Admin Del','addel@rc.test','admin', null),
  ('dd000000-0000-0000-0000-000000000000','Dist Del','dddel@rc.test','distributor','d5000000-0000-0000-0000-000000000000');

-- Artefactos COMPARTIDOS creados por el admin (deben SOBREVIVIR con autor NULL):
insert into task_categories(id, name, scope, owner_user_id, created_by) values
  ('c5000000-0000-0000-0000-000000000000','Global Del','global', null,'ad000000-0000-0000-0000-000000000000');
insert into task_templates(id, name, created_by) values
  ('e5000000-0000-0000-0000-000000000000','Tpl Del','ad000000-0000-0000-0000-000000000000');
insert into template_items(id, template_id, title, priority, recurrence) values
  ('e5100000-0000-0000-0000-000000000000','e5000000-0000-0000-0000-000000000000','Item','medium','once');
insert into template_assignments(template_id, user_id, assigned_by) values
  ('e5000000-0000-0000-0000-000000000000','dd000000-0000-0000-0000-000000000000','ad000000-0000-0000-0000-000000000000');

-- Datos PROPIOS del distribuidor (deben CASCADE-borrarse). owner/distrib explícitos (trigger off en replica):
insert into task_categories(id, name, scope, owner_user_id, created_by) values
  ('c5100000-0000-0000-0000-000000000000','Personal Del','personal','dd000000-0000-0000-0000-000000000000','dd000000-0000-0000-0000-000000000000');
insert into tasks(id, owner_user_id, distribution_id, title, start_date, recurrence) values
  ('f5000000-0000-0000-0000-000000000000','dd000000-0000-0000-0000-000000000000','d5000000-0000-0000-0000-000000000000','Tarea Del','2027-06-01','once');
insert into task_instances(task_id, date, owner_user_id, distribution_id) values
  ('f5000000-0000-0000-0000-000000000000','2027-06-01','dd000000-0000-0000-0000-000000000000','d5000000-0000-0000-0000-000000000000');

set session_replication_role = default;  -- REACTIVA triggers + acciones FK (cascade/set null) para el borrado

\echo '===== ADR-0017: borrar ADMIN (autor de global+template+assignment) → ÉXITO + artefactos sobreviven, autor NULL ====='
do $$
begin
  delete from auth.users where id = 'ad000000-0000-0000-0000-000000000000';  -- camino prod
  assert not exists (select 1 from public.users where id='ad000000-0000-0000-0000-000000000000'), 'admin borrado';
  assert exists (select 1 from public.task_categories      where id='c5000000-0000-0000-0000-000000000000' and created_by  is null), 'global cat sobrevive (created_by NULL)';
  assert exists (select 1 from public.task_templates       where id='e5000000-0000-0000-0000-000000000000' and created_by  is null), 'template sobrevive (created_by NULL)';
  assert exists (select 1 from public.template_assignments where template_id='e5000000-0000-0000-0000-000000000000' and assigned_by is null), 'assignment sobrevive (assigned_by NULL)';
end $$;

\echo '===== ADR-0017: borrar DISTRIBUIDOR (tareas/instancias/personal) → ÉXITO + cascade; compartidos intactos ====='
do $$
declare n int;
begin
  delete from auth.users where id = 'dd000000-0000-0000-0000-000000000000';  -- camino prod
  assert not exists (select 1 from public.users where id='dd000000-0000-0000-0000-000000000000'), 'distribuidor borrado';
  select count(*) into n from public.tasks            where id='f5000000-0000-0000-0000-000000000000';                 assert n=0, 'task cascade-borrada';
  select count(*) into n from public.task_instances   where task_id='f5000000-0000-0000-0000-000000000000';            assert n=0, 'task_instance cascade-borrada';
  select count(*) into n from public.task_categories  where id='c5100000-0000-0000-0000-000000000000';                 assert n=0, 'categoría personal cascade-borrada';
  select count(*) into n from public.template_assignments where user_id='dd000000-0000-0000-0000-000000000000';        assert n=0, 'assignment del user cascade-borrado (user_id CASCADE)';
  assert exists (select 1 from public.task_templates where id='e5000000-0000-0000-0000-000000000000'), 'template COMPARTIDO sigue vivo';
end $$;

\echo '===== 32_user_delete OK ====='
