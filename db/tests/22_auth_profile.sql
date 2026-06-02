-- TESTS AUTH 1/3 (NO core). Triggers de 0002: perfil al signup + sync de auth_providers.
-- Usuarios FRESCOS (emails/ids distintos a fixtures). Corre como superusuario: los triggers
-- (SECURITY DEFINER) crean/actualizan public.users; la lectura como superusuario ve todo.

\echo '===== (a) signup email/password → perfil role=null + full_name + desired_distribution ====='
do $$
declare r record;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (
    'e1e1e1e1-0000-0000-0000-000000000000', 'newdist@rc.test',
    jsonb_build_object('full_name', 'Nueva Persona', 'desired_distribution', 'Distribución Nueva')
  );
  select * into r from public.users where id = 'e1e1e1e1-0000-0000-0000-000000000000';
  assert r.id is not null, '(a) el trigger no creó el perfil';
  assert r.role is null, format('(a) role esperado null, fue %s', r.role);
  assert r.distribution_id is null, '(a) distribution_id esperado null (CHECK rol↔distribución)';
  assert r.email = 'newdist@rc.test', '(a) email no copiado';
  assert r.full_name = 'Nueva Persona', format('(a) full_name = %s', r.full_name);
  assert r.preferences ->> 'desired_distribution' = 'Distribución Nueva',
    format('(a) desired_distribution = %s', r.preferences ->> 'desired_distribution');
end $$;

\echo '===== (c) auth_providers: email→{password}, +google→{google,password}, unlink→{password} ====='
do $$
declare ap text[];
begin
  insert into auth.identities (user_id, provider)
    values ('e1e1e1e1-0000-0000-0000-000000000000', 'email');
  select auth_providers into ap from public.users where id = 'e1e1e1e1-0000-0000-0000-000000000000';
  assert ap = array['password'], format('(c) tras email: %s (esperaba {password})', ap);

  insert into auth.identities (user_id, provider)
    values ('e1e1e1e1-0000-0000-0000-000000000000', 'google');
  select auth_providers into ap from public.users where id = 'e1e1e1e1-0000-0000-0000-000000000000';
  assert ap = array['google','password'], format('(c) tras link google: %s (esperaba {google,password})', ap);

  delete from auth.identities
    where user_id = 'e1e1e1e1-0000-0000-0000-000000000000' and provider = 'google';
  select auth_providers into ap from public.users where id = 'e1e1e1e1-0000-0000-0000-000000000000';
  assert ap = array['password'], format('(c) tras unlink google: %s (esperaba {password})', ap);
end $$;

\echo '===== (b) signup Google → perfil role=null + auth_providers {google} ====='
do $$
declare r record; ap text[];
begin
  insert into auth.users (id, email, raw_user_meta_data) values (
    'e2e2e2e2-0000-0000-0000-000000000000', 'ggl@rc.test',
    jsonb_build_object('full_name', 'Google Persona')
  );
  select * into r from public.users where id = 'e2e2e2e2-0000-0000-0000-000000000000';
  assert r.role is null, '(b) role esperado null';
  assert r.full_name = 'Google Persona', format('(b) full_name = %s', r.full_name);

  insert into auth.identities (user_id, provider)
    values ('e2e2e2e2-0000-0000-0000-000000000000', 'google');
  select auth_providers into ap from public.users where id = 'e2e2e2e2-0000-0000-0000-000000000000';
  assert ap = array['google'], format('(b) auth_providers = %s (esperaba {google})', ap);
end $$;

\echo '===== (chk) los perfiles existen → el CHECK rol↔distribución no abortó ningún INSERT ====='
do $$
declare n int;
begin
  select count(*) into n from public.users
   where id in ('e1e1e1e1-0000-0000-0000-000000000000','e2e2e2e2-0000-0000-0000-000000000000');
  assert n = 2, format('(chk) esperaba 2 perfiles nuevos, hay %s', n);
end $$;

\echo '===== AUTH 1/3 (capa DB): perfil al signup + sync auth_providers — VERDE ====='
