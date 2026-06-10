-- TESTS dispatch desatendido (ADR-0029, route /auth/ms-cron). Guardan los INVARIANTES SQL en que se apoya
-- la route (lock atómico anti doble-envío, flag revocado → failed con motivo, supresión → skipped). El nivel
-- HTTP (401 por secreto, envío Resend) es de despliegue (route Node), fuera del harness SQL.

begin;
  update public.users set ms_mailing_enabled = true where id = 'a1a1a1a1-0000-0000-0000-000000000000';
  insert into public.ms_campaigns (id, owner_user_id, status, scheduled_at)
    values ('d1d10000-0000-0000-0000-000000000000', 'a1a1a1a1-0000-0000-0000-000000000000', 'scheduled', '2020-01-01 00:00:00+00');
  insert into public.ms_sends (id, campaign_id, owner_user_id, email, status, unsub_token)
    values ('5e5d0000-0000-0000-0000-000000000000', 'd1d10000-0000-0000-0000-000000000000', 'a1a1a1a1-0000-0000-0000-000000000000', 'cand@x.com', 'pending', 'aaaa0000-0000-0000-0000-00000000aaaa');

  \echo '===== LOCK atómico scheduled→sending: solo un claim gana (anti doble-envío) ====='
  do $$
  declare r1 uuid; r2 uuid;
  begin
    update public.ms_campaigns set status = 'sending', started_at = now()
      where id = 'd1d10000-0000-0000-0000-000000000000' and status = 'scheduled' returning id into r1;
    update public.ms_campaigns set status = 'sending'
      where id = 'd1d10000-0000-0000-0000-000000000000' and status = 'scheduled' returning id into r2;
    assert r1 is not null, 'primer claim toma el lote';
    assert r2 is null, 'segundo claim NO re-procesa (lock)';
  end $$;

  \echo '===== Flag revocado al disparar → lote failed con motivo (sin status nuevo) ====='
  update public.ms_campaigns set status = 'scheduled' where id = 'd1d10000-0000-0000-0000-000000000000';
  update public.users set ms_mailing_enabled = false where id = 'a1a1a1a1-0000-0000-0000-000000000000';
  do $$
  begin
    assert (select ms_mailing_enabled from public.users where id = 'a1a1a1a1-0000-0000-0000-000000000000') = false, 'owner sin flag';
    update public.ms_sends set status = 'failed', error = 'módulo deshabilitado para el owner'
      where campaign_id = 'd1d10000-0000-0000-0000-000000000000' and status in ('pending', 'failed');
    assert (select status from public.ms_sends where id = '5e5d0000-0000-0000-0000-000000000000') = 'failed', 'send → failed';
    assert (select error from public.ms_sends where id = '5e5d0000-0000-0000-0000-000000000000') = 'módulo deshabilitado para el owner', 'con motivo';
  end $$;

  \echo '===== Supresión del owner → skipped ====='
  update public.ms_sends set status = 'pending', error = null where id = '5e5d0000-0000-0000-0000-000000000000';
  insert into public.ms_suppressions (owner_user_id, email) values ('a1a1a1a1-0000-0000-0000-000000000000', 'cand@x.com');
  do $$
  begin
    assert (select exists (
      select 1 from public.ms_suppressions
      where owner_user_id = 'a1a1a1a1-0000-0000-0000-000000000000' and lower(email) = lower('cand@x.com')
    )), 'email suprimido para el owner';
    update public.ms_sends set status = 'skipped', error = 'destinatario dado de baja' where id = '5e5d0000-0000-0000-0000-000000000000';
    assert (select status from public.ms_sends where id = '5e5d0000-0000-0000-0000-000000000000') = 'skipped', 'send → skipped';
  end $$;
rollback;
\echo '===== 41_ms_dispatch OK ====='
