-- TEST SHIM (NO core) — emula lo que Supabase provee: roles + auth.uid() + auth.users.
-- Permite probar la MISMA RLS/schema de prod contra un Postgres plano, sin Docker.

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;  -- como en Supabase
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- auth.users mínima (Supabase la gestiona vía GoTrue; aquí solo el id para el FK).
create table if not exists auth.users (id uuid primary key);

-- auth.uid() fiel: lee el claim 'sub' del JWT inyectado en request.jwt.claims.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
