-- 0014_must_set_password.sql — ADR-0022: forzar set-password BULLETPROOF (cierra ERROR 1).
--
-- El flag pasa de app_metadata (que dependía del flujo del enlace) a una COLUMNA en public.users, leída
-- FRESCA en el middleware (cubre TODAS las rutas + server actions, sin staleness de JWT). Un trigger impide
-- que el propio usuario se lo limpie (anti-self-clear): solo admin (sesión) o el sistema (service_role,
-- app_current_role() null) pueden cambiarlo. La RLS ya impide que un no-admin escriba filas ajenas; este
-- trigger blinda además la columna en la PROPIA fila.
--
-- Aditivo: solo añade columna + trigger. Idempotente (add column → if not exists vía consolidado;
-- create or replace function; create trigger → or replace vía consolidado).

alter table public.users add column must_set_password boolean not null default false;

create or replace function public.forbid_must_set_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.must_set_password is distinct from old.must_set_password then
    -- Permitido SOLO a: el SISTEMA (service_role / sin sujeto JWT → auth.uid() null) o un ADMIN.
    -- Un usuario autenticado (auth.uid() NO null) jamás toca su propio flag, tenga el rol que tenga
    -- — incluido role=null (cuenta recién creada): app_current_role() null por falta de rol NO es 'sistema'.
    -- `is distinct from` trata null como «distinto de admin» → también bloquea al usuario sin rol.
    if (select auth.uid()) is not null
       and (select public.app_current_role()) is distinct from 'admin'::public.app_role then
      raise exception 'no puedes modificar must_set_password';
    end if;
  end if;
  return new;
end $$;

create trigger trg_users_must_set_password
  before update on public.users
  for each row execute function public.forbid_must_set_password_change();
