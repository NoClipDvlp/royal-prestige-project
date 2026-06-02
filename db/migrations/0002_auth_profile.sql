-- ============================================================================
-- Royal Control — 0002_auth_profile  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0006.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX].
--
-- Capa DB de auth (ADR-0006, sub-paso 1/3). ADITIVO: NO toca users_select, users_labels ni
-- 0000_init → RLS y DEBT-0004 intactos. Dos triggers sobre el schema auth (gestionado por Supabase):
--   1) handle_new_user: crea el perfil public.users al signup (role=null, atómico, sin orfandad).
--   2) sync_auth_providers: mantiene users.auth_providers al vincular/desvincular identidades.
-- ============================================================================

-- ── 1) Perfil al signup ──────────────────────────────────────────────────────
-- AFTER INSERT on auth.users. SECURITY DEFINER (owner postgres) → bypassa la RLS de users
-- (INSERT solo-admin) e inserta el perfil. role=null + distribution_id=null cumplen el CHECK
-- rol↔distribución. Copia full_name y guarda la distribución DESEADA en preferences (jsonb),
-- sin tocar el schema de columnas. NO aborta el signup ante errores recuperables.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, role, distribution_id, preferences)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    null,
    null,
    jsonb_build_object('desired_distribution', new.raw_user_meta_data ->> 'desired_distribution')
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- No abortar el signup: si el perfil no se pudo crear, se registra y se trata como role=null.
    raise warning 'handle_new_user: perfil no creado para % (% / %)', new.id, sqlstate, sqlerrm;
    return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2) Sincronización de auth_providers ──────────────────────────────────────
-- AFTER INSERT OR DELETE on auth.identities. Recalcula el array desde auth.identities.
-- Supabase usa provider='email' para el método de contraseña → se MAPEA a 'password'
-- (consistente con DATA_MODEL: auth_providers = {'password','google'}).
create or replace function public.sync_auth_providers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.users
  set auth_providers = (
    select coalesce(array_agg(distinct m order by m), array[]::text[])
    from (
      select case when i.provider = 'email' then 'password' else i.provider end as m
      from auth.identities i
      where i.user_id = uid
    ) s
  )
  where id = uid;
  return coalesce(new, old);
end;
$$;

create trigger on_auth_identity_changed
  after insert or delete on auth.identities
  for each row execute function public.sync_auth_providers();
