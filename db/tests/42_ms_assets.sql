-- TESTS bucket ms_assets (ADR-0032 enmendado / migración 0020): SOLO estructura del bucket.
-- Las policies de storage.objects se eliminaron (Supabase 42501); la subida va por server action con
-- service_role confinado (lib/ms/assets.ts) que fija el path {user.id}/{uuid}.ext y valida tipo/tamaño.

begin;
  do $$
  begin
    assert (select public from storage.buckets where id = 'ms_assets'), 'bucket ms_assets existe y es público (lectura)';
  end $$;
rollback;
\echo '===== 42_ms_assets OK ====='
