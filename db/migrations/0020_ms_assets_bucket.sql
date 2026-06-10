-- ============================================================================
-- Royal Control — 0020_ms_assets_bucket  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0032.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-0032]. Commit con [CORE-APPROVED: ADR-0032].
--
-- Bucket de Storage para imágenes inline del cuerpo de correo (ADR-0032, módulo MS). Las imágenes pegadas
-- se SUBEN a Storage (nunca base64 inline) → <img src="url pública">. Bucket PÚBLICO de lectura (los clientes
-- de correo cargan la <img> sin sesión); ESCRITURA con RLS por owner: cada quien sube SOLO bajo su carpeta
-- {owner_uid}/... (path prefix). El saneador (lib/ms/sanitize.ts) ya restringe img[src] a https. La validación
-- de tipo/tamaño (≤2MB, png/jpeg/webp/gif, nombre uuid) la hace el server action de subida.
-- Idempotente. Aplica en Supabase (esquema storage gestionado por Supabase; en el harness vía shim).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('ms_assets', 'ms_assets', true)
on conflict (id) do update set public = true;

alter table storage.objects enable row level security;

-- Lectura: bucket público → cualquiera puede leer (la <img> del correo carga sin sesión).
drop policy if exists ms_assets_read on storage.objects;
create policy ms_assets_read on storage.objects for select
  using (bucket_id = 'ms_assets');

-- Escritura: solo el dueño, y solo bajo su carpeta {owner_uid}/...
drop policy if exists ms_assets_insert on storage.objects;
create policy ms_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ms_assets' and name like ((select auth.uid())::text || '/%'));

drop policy if exists ms_assets_update on storage.objects;
create policy ms_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'ms_assets' and owner = (select auth.uid()))
  with check (bucket_id = 'ms_assets' and name like ((select auth.uid())::text || '/%'));

drop policy if exists ms_assets_delete on storage.objects;
create policy ms_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ms_assets' and owner = (select auth.uid()));
