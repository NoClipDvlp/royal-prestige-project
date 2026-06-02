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

-- auth.users mínima (Supabase la gestiona vía GoTrue). email + raw_user_meta_data los lee el
-- trigger handle_new_user (0002). Columnas nullable/default → no rompen inserts existentes.
create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- auth.identities (Supabase la gestiona; aquí lo mínimo que lee sync_auth_providers: user_id + provider).
create table if not exists auth.identities (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  provider   text not null,
  created_at timestamptz default now()
);

-- auth.uid() fiel: lee el claim 'sub' del JWT inyectado en request.jwt.claims.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
