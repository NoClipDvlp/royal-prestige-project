-- TESTS revoke materialize_day (ADR-0026 / migración 0017). El OWNER (cron) puede; authenticated NO.

\echo '===== OWNER (postgres / cron) sí puede materializar ====='
begin;
  do $$ begin perform public.materialize_day('2030-06-06'); end $$;  -- sin error = OK
rollback;

\echo '===== AUTHENTICATED NO puede (EXECUTE revocado) ====='
begin;
  set local role authenticated;
  do $$
  begin
    begin
      perform public.materialize_day('2030-06-07');
      raise exception 'XFAIL: authenticated ejecutó materialize_day';
    exception when others then
      if sqlerrm like 'XFAIL%' then raise; end if;  -- permiso denegado = OK
    end;
  end $$;
rollback;
\echo '===== 38_revoke_materialize_day OK ====='
