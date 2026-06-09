-- TESTS must_set_password (NO core) — ADR-0022 / migración 0014. Columna + trigger anti-self-clear.
-- Reusa fixtures: a1 (distribuidor), 11111111 (admin). users_update permite self → el TRIGGER es lo que
-- bloquea al distribuidor (no la RLS). Todo en transacciones con rollback → sin contaminación.

\echo '===== ADR-0022: default false ====='
do $$ begin
  assert (select must_set_password from public.users where id='a1a1a1a1-0000-0000-0000-000000000000') = false,
    'must_set_password nace false';
end $$;

\echo '===== anti-self-clear: el DISTRIBUIDOR no puede cambiar su propio flag (RLS self OK → lo bloquea el trigger) ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    begin
      update public.users set must_set_password = true where id='a1a1a1a1-0000-0000-0000-000000000000';
      raise exception 'XFAIL: el distribuidor cambió su must_set_password';
    exception when others then
      if sqlerrm like 'XFAIL%' then raise; end if;  -- cualquier otra excepción = bloqueado (OK)
    end;
  end $$;
rollback;

\echo '===== anti-self-clear: usuario SIN ROL (role=null) tampoco puede tocar su flag (app_current_role() null ≠ sistema) ====='
-- Regresión del hueco #4 (review ADR-0022): el guard discrimina por auth.uid() (sistema=null), NO por
-- app_current_role() (que también es null para una cuenta sin rol). Una cuenta recién creada NO es 'sistema'.
begin;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    begin
      update public.users set must_set_password = true where id='00000000-0000-0000-0000-000000000000';
      raise exception 'XFAIL: el usuario sin rol cambió su must_set_password';
    exception when others then
      if sqlerrm like 'XFAIL%' then raise; end if;  -- bloqueado = OK
    end;
  end $$;
rollback;

\echo '===== ADMIN sí puede setearlo (otro usuario) ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    update public.users set must_set_password = true where id='a1a1a1a1-0000-0000-0000-000000000000';
    assert (select must_set_password from public.users where id='a1a1a1a1-0000-0000-0000-000000000000') = true,
      'admin setea el flag';
  end $$;
rollback;

\echo '===== SISTEMA (service_role, app_current_role() null) sí puede cambiarlo (changeOwnPassword/admin actions) ====='
begin;
  set local role service_role;  -- bypassrls + sin jwt → app_current_role() null
  do $$
  begin
    update public.users set must_set_password = true where id='a1a1a1a1-0000-0000-0000-000000000000';
    assert (select must_set_password from public.users where id='a1a1a1a1-0000-0000-0000-000000000000') = true,
      'service_role setea el flag (al crear/resetear)';
    update public.users set must_set_password = false where id='a1a1a1a1-0000-0000-0000-000000000000';
    assert (select must_set_password from public.users where id='a1a1a1a1-0000-0000-0000-000000000000') = false,
      'service_role limpia el flag (changeOwnPassword)';
  end $$;
rollback;

\echo '===== 35_must_set_password OK ====='
