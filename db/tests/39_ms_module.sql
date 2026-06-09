-- TESTS módulo MS (ADR-0027 / migración 0018): aislamiento ms_*, flag admin-only endurecido, opt-out.
-- Reusa fixtures: a1 (a1a1a1a1, distribuidor A), b1 (b1b1b1b1, distribuidor B), admin (11111111),
-- role=null (00000000). Todo en una transacción con rollback. Patrón XFAIL para excepciones esperadas.

begin;

\echo '===== FLAG: el SISTEMA (auth.uid() null) puede activar el flag ====='
-- como postgres (superusuario), sin jwt → auth.uid() null → permitido (camino service_role/trigger)
do $$
begin
  update public.users set ms_mailing_enabled = true where id = 'a1a1a1a1-0000-0000-0000-000000000000';
  assert (select ms_mailing_enabled from public.users where id='a1a1a1a1-0000-0000-0000-000000000000'),
    'sistema activa el flag';
  update public.users set ms_mailing_enabled = false where id = 'a1a1a1a1-0000-0000-0000-000000000000'; -- reset
end $$;

\echo '===== FLAG: el DISTRIBUIDOR NO puede auto-activarse (escalada bloqueada) ====='
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$
begin
  begin
    update public.users set ms_mailing_enabled = true where id = 'a1a1a1a1-0000-0000-0000-000000000000';
    raise exception 'XFAIL: el distribuidor pudo auto-activar el flag';
  exception when others then
    if sqlerrm like 'XFAIL%' then raise; end if;  -- bloqueado = OK
  end;
  assert (select ms_mailing_enabled from public.users where id='a1a1a1a1-0000-0000-0000-000000000000') = false,
    'el flag sigue en false';
end $$;

\echo '===== FLAG: el usuario role=null tampoco (no se confunde con "sistema") ====='
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$
begin
  begin
    update public.users set ms_mailing_enabled = true where id = '00000000-0000-0000-0000-000000000000';
    raise exception 'XFAIL: role=null pudo activar el flag';
  exception when others then
    if sqlerrm like 'XFAIL%' then raise; end if;
  end;
end $$;

\echo '===== FLAG: el ADMIN sí puede habilitar a un distribuidor ====='
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$
begin
  update public.users set ms_mailing_enabled = true where id = 'a1a1a1a1-0000-0000-0000-000000000000';
  assert (select ms_mailing_enabled from public.users where id='a1a1a1a1-0000-0000-0000-000000000000'),
    'admin habilita al distribuidor';
end $$;

-- volver a SISTEMA para sembrar contenido (bypass RLS) y habilitar a b1
reset role; select set_config('request.jwt.claims', '', true);
update public.users set ms_mailing_enabled = true where id = 'b1b1b1b1-0000-0000-0000-000000000000';
insert into public.ms_datasets (id, owner_user_id, name) values
  ('d5500000-0000-0000-0000-0000000000a1','a1a1a1a1-0000-0000-0000-000000000000','Dataset A1'),
  ('d5500000-0000-0000-0000-0000000000b1','b1b1b1b1-0000-0000-0000-000000000000','Dataset B1');

\echo '===== RLS: el distribuidor ve SOLO sus datasets (aislamiento por owner) ====='
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.ms_datasets) = 1, 'a1 ve 1 dataset (el suyo)';
  assert (select count(*) from public.ms_datasets where owner_user_id='b1b1b1b1-0000-0000-0000-000000000000') = 0,
    'a1 NO ve el dataset de b1';
end $$;

\echo '===== RLS: flag OFF → 0 filas aunque sea el dueño (doble candado) ====='
reset role; select set_config('request.jwt.claims', '', true);
update public.users set ms_mailing_enabled = false where id='a1a1a1a1-0000-0000-0000-000000000000';
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.ms_datasets) = 0, 'flag OFF → a1 no ve nada';
end $$;
-- re-activar a1 para el resto
reset role; select set_config('request.jwt.claims', '', true);
update public.users set ms_mailing_enabled = true where id='a1a1a1a1-0000-0000-0000-000000000000';

\echo '===== OPT-OUT: token → supresión; suprimido → is_suppressed; cross-tenant aislado ====='
insert into public.ms_templates (id, owner_user_id, name, subject, body_html) values
  ('70000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','T','S','<p>B</p>');
insert into public.ms_campaigns (id, owner_user_id, template_id, subject_snapshot, body_html_snapshot) values
  ('c0000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000',
   '70000000-0000-0000-0000-000000000000','S','<p>B</p>');
insert into public.ms_sends (id, campaign_id, owner_user_id, email, unsub_token, status) values
  ('e0000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000000',
   'a1a1a1a1-0000-0000-0000-000000000000','cand@x.com','aaaa0000-0000-0000-0000-00000000aaaa','sent');

select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$ begin assert public.ms_is_suppressed('cand@x.com') = false, 'aún no suprimido'; end $$;

-- la baja pública la dispara ANON con el token (sin sesión); token falso = no-op silencioso
reset role; select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  perform public.ms_suppress_by_token('aaaa0000-0000-0000-0000-00000000aaaa');
  perform public.ms_suppress_by_token('ffffffff-0000-0000-0000-ffffffffffff'); -- inexistente → no-op
end $$;

reset role; select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$ begin assert public.ms_is_suppressed('cand@x.com') = true, 'tras baja por token → suprimido'; end $$;

reset role; select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$ begin assert public.ms_is_suppressed('cand@x.com') = false, 'la supresión de a1 NO afecta a b1 (aislada)'; end $$;

\echo '===== ms_sends acepta status skipped (substrato de suprimido→skipped) ====='
reset role; select set_config('request.jwt.claims', '', true);
do $$
begin
  insert into public.ms_sends (campaign_id, owner_user_id, email, status)
  values ('c0000000-0000-0000-0000-000000000000','a1a1a1a1-0000-0000-0000-000000000000','skip@x.com','skipped');
  assert (select count(*) from public.ms_sends where status='skipped') = 1, 'status skipped válido';
end $$;

\echo '===== ACT.2-A multi-plantilla: render por-destinatario en ms_sends + campaña SIN snapshot (nullable) ====='
do $$
begin
  -- campaña sin snapshot a nivel lote (ahora nullable); template_id = plantilla por defecto
  insert into public.ms_campaigns (id, owner_user_id, template_id, status)
  values ('c0000000-0000-0000-0000-0000000000c2','a1a1a1a1-0000-0000-0000-000000000000',
          '70000000-0000-0000-0000-000000000000','draft');
  -- dos destinatarios con render DISTINTO en el MISMO lote (multi-plantilla / merge por fila)
  insert into public.ms_sends (campaign_id, owner_user_id, email, subject_snapshot, body_html_snapshot, status) values
    ('c0000000-0000-0000-0000-0000000000c2','a1a1a1a1-0000-0000-0000-000000000000','ana@x.com', 'Hola Ana', '<p>Ana</p>', 'sent'),
    ('c0000000-0000-0000-0000-0000000000c2','a1a1a1a1-0000-0000-0000-000000000000','beto@x.com','Hola Beto','<p>Beto</p>','sent');
  assert (select subject_snapshot from public.ms_sends
          where campaign_id='c0000000-0000-0000-0000-0000000000c2' and email='ana@x.com') = 'Hola Ana',
    'render por-destinatario almacenado';
  assert (select count(distinct subject_snapshot) from public.ms_sends
          where campaign_id='c0000000-0000-0000-0000-0000000000c2') = 2,
    'dos renders distintos en el mismo lote';
  assert (select subject_snapshot from public.ms_campaigns
          where id='c0000000-0000-0000-0000-0000000000c2') is null,
    'snapshot de lote opcional (nullable)';
end $$;

\echo '===== ACT.2-B programar: status scheduled + scheduled_at válidos ====='
do $$
begin
  insert into public.ms_campaigns (id, owner_user_id, template_id, status, scheduled_at)
  values ('c0000000-0000-0000-0000-0000000000c3','a1a1a1a1-0000-0000-0000-000000000000',
          '70000000-0000-0000-0000-000000000000','scheduled','2030-01-01 09:00:00+00');
  assert (select status from public.ms_campaigns where id='c0000000-0000-0000-0000-0000000000c3') = 'scheduled',
    'status scheduled válido';
  assert (select scheduled_at from public.ms_campaigns where id='c0000000-0000-0000-0000-0000000000c3') is not null,
    'scheduled_at almacenado';
end $$;

rollback;
\echo '===== 39_ms_module OK ====='
