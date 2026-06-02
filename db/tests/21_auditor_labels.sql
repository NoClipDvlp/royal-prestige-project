-- TESTS DEBT-0004 / ADR-0005 (NO core). El auditor solo ve labels (sin PII) vía users_labels,
-- y el gate de la vista no fuga a otros roles. ON_ERROR_STOP=1 → cualquier fallo aborta ≠0.

\echo '===== (b-cols) users_labels expone SOLO id/full_name/distribution_id (sin PII) ====='
do $$
declare cols text[];
begin
  select array_agg(column_name::text order by column_name::text) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'users_labels';
  assert cols = array['distribution_id','full_name','id'],
    format('users_labels columnas = %s (esperaba distribution_id, full_name, id)', cols);
  assert not ('email'          = any(cols)), 'users_labels NO debe exponer email';
  assert not ('phone'          = any(cols)), 'users_labels NO debe exponer phone';
  assert not ('photo_url'      = any(cols)), 'users_labels NO debe exponer photo_url';
  assert not ('preferences'    = any(cols)), 'users_labels NO debe exponer preferences';
  assert not ('auth_providers' = any(cols)), 'users_labels NO debe exponer auth_providers';
end $$;

\echo '===== (a)(b) auditor: SOLO su propia fila en users (0 de otros); TODAS en users_labels ====='
-- (a) corregido (Opción A, Nicolas 2026-06-02): el auto-acceso `id = auth.uid()` es universal
-- (incluso role=null ve su fila). El requisito real de DEBT-0004 es "0 PII de OTROS", no 0 absoluto.
begin;
  select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.users;
    assert n = 1, format('(a) auditor ve %s filas en users crudo (esperaba 1, solo la suya)', n);
    select count(*) into n from public.users where id <> '22222222-0000-0000-0000-000000000000';
    assert n = 0, format('(a) auditor ve %s filas de OTROS en users (esperaba 0, sin PII ajena)', n);
    select count(*) into n from public.users_labels;
    assert n = 8, format('(b) auditor ve %s labels (esperaba 8 = todos los usuarios)', n);
  end $$;
rollback;

\echo '===== (c) distributor: users_labels 0 (gate); users solo su fila ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.users_labels;
    assert n = 0, format('(c) distributor ve %s labels (esperaba 0, gate de la vista)', n);
    select count(*) into n from public.users;
    assert n = 1, format('(c) distributor ve %s en users (esperaba 1, su fila)', n);
  end $$;
rollback;

\echo '===== (d) role=null: users_labels 0; users su fila ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.users_labels;
    assert n = 0, format('(d) role=null ve %s labels (esperaba 0)', n);
    select count(*) into n from public.users;
    assert n = 1, format('(d) role=null ve %s en users (esperaba 1, su fila)', n);
  end $$;
rollback;

\echo '===== (e) admin: users todas; users_labels todas ====='
begin;
  select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.users;
    assert n = 8, format('(e) admin ve %s en users (esperaba 8)', n);
    select count(*) into n from public.users_labels;
    assert n = 8, format('(e) admin ve %s labels (esperaba 8)', n);
  end $$;
rollback;

\echo '===== DEBT-0004: auditor SOLO labels, sin PII — VERDE ====='
