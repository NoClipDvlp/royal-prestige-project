-- FIXTURES (NO core) — cargadas como superusuario (bypass RLS).
-- Distribuciones A y B, un distribuidor en cada una, auditor, admin, usuario role=null,
-- + datos para probar aislamiento y constraints.

-- auth.users (ids)
insert into auth.users(id) values
  ('11111111-0000-0000-0000-000000000000'), -- admin
  ('22222222-0000-0000-0000-000000000000'), -- auditor
  ('a1a1a1a1-0000-0000-0000-000000000000'), -- distA1
  ('b1b1b1b1-0000-0000-0000-000000000000'), -- distB1
  ('a2a2a2a2-0000-0000-0000-000000000000'), -- ownerA2
  ('a3a3a3a3-0000-0000-0000-000000000000'), -- ownerA3
  ('a4a4a4a4-0000-0000-0000-000000000000'), -- ownerA4 (para test del 4º owner)
  ('00000000-0000-0000-0000-000000000000'); -- role=null

insert into distributions(id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Distribución A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Distribución B');

insert into users(id, full_name, email, role, distribution_id) values
  ('11111111-0000-0000-0000-000000000000','Admin','admin@rc.test','admin', null),
  ('22222222-0000-0000-0000-000000000000','Auditor','aud@rc.test','auditor', null),
  ('a1a1a1a1-0000-0000-0000-000000000000','Dist A1','a1@rc.test','distributor','aaaaaaaa-0000-0000-0000-000000000000'),
  ('b1b1b1b1-0000-0000-0000-000000000000','Dist B1','b1@rc.test','distributor','bbbbbbbb-0000-0000-0000-000000000000'),
  ('a2a2a2a2-0000-0000-0000-000000000000','Owner A2','a2@rc.test','distributor','aaaaaaaa-0000-0000-0000-000000000000'),
  ('a3a3a3a3-0000-0000-0000-000000000000','Owner A3','a3@rc.test','distributor','aaaaaaaa-0000-0000-0000-000000000000'),
  ('a4a4a4a4-0000-0000-0000-000000000000','Owner A4','a4@rc.test','distributor','aaaaaaaa-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-000000000000','Sin Rol','norole@rc.test', null, null);

insert into tasks(id, owner_user_id, distribution_id, title, start_date) values
  ('aaaa1111-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Tarea A','2026-06-01'),
  ('bbbb1111-0000-0000-0000-000000000000','b1b1b1b1-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','Tarea B','2026-06-01');

-- task_instances: distribution_id/owner_user_id los pone el trigger desde el task padre.
insert into task_instances(task_id, date) values
  ('aaaa1111-0000-0000-0000-000000000000','2026-06-01'),
  ('bbbb1111-0000-0000-0000-000000000000','2026-06-01');

insert into metric_snapshots(user_id, period, period_start, period_end, compliance_pct, tasks_done) values
  ('a1a1a1a1-0000-0000-0000-000000000000','monthly','2026-05-01','2026-05-31', 80, 10),
  ('b1b1b1b1-0000-0000-0000-000000000000','monthly','2026-05-01','2026-05-31', 60, 6);

-- owners de A: slots 1,2,3 ocupados (distA1, ownerA2, ownerA3). ownerA4 queda para el test del 4º.
insert into distribution_owners(distribution_id, user_id, owner_slot) values
  ('aaaaaaaa-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000',1),
  ('aaaaaaaa-0000-0000-0000-000000000000','a2a2a2a2-0000-0000-0000-000000000000',2),
  ('aaaaaaaa-0000-0000-0000-000000000000','a3a3a3a3-0000-0000-0000-000000000000',3);

insert into task_categories(name, scope, owner_user_id, created_by) values
  ('Global X','global', null, '11111111-0000-0000-0000-000000000000'),
  ('Personal A1','personal','a1a1a1a1-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000');
