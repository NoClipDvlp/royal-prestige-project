-- TESTS bucket ms_assets (ADR-0032 / migración 0020): estructura + RLS owner-path (aislamiento de carpeta).
-- (En el harness, storage.* es el shim de 00_auth_shim; la semántica RLS sí se ejerce.)

begin;
  \echo '===== estructura: bucket público + 4 policies ms_assets_* ====='
  do $$
  begin
    assert (select public from storage.buckets where id = 'ms_assets'), 'bucket ms_assets público';
    assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'ms_assets_%') = 4,
      '4 policies ms_assets (read/insert/update/delete)';
  end $$;

  \echo '===== RLS owner-path: el distribuidor sube SOLO bajo su carpeta {uid}/... ====='
  select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000000"}', true);
  set local role authenticated;
  do $$
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('ms_assets', 'a1a1a1a1-0000-0000-0000-000000000000/logo.png', 'a1a1a1a1-0000-0000-0000-000000000000');
    assert (select count(*) from storage.objects where name like 'a1a1a1a1-%') = 1, 'sube en su propia carpeta';
    -- subir bajo la carpeta de OTRO owner → bloqueado por la with-check
    begin
      insert into storage.objects (bucket_id, name, owner)
        values ('ms_assets', 'b1b1b1b1-0000-0000-0000-000000000000/evil.png', 'a1a1a1a1-0000-0000-0000-000000000000');
      raise exception 'XFAIL: subió en carpeta ajena';
    exception when others then
      if sqlerrm like 'XFAIL%' then raise; end if; -- bloqueado = OK
    end;
  end $$;
rollback;
\echo '===== 42_ms_assets OK ====='
