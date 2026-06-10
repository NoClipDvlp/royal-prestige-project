-- ============================================================================
-- Royal Control — 0020_ms_assets_bucket  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0032 (enmendado).
-- Cambios requieren ADR + [CORE-APPROVED: ADR-0032]. Commit con [CORE-APPROVED: ADR-0032].
--
-- Bucket de Storage para imágenes inline del cuerpo de correo (ADR-0032 §2 ENMIENDA). SOLO el bucket:
-- las policies de storage.objects se ELIMINARON porque Supabase rechaza DDL sobre storage.objects con
-- 42501 (must be owner) → imposibles de aplicar por SQL. La SUBIDA va ahora por un server action con
-- service_role CONFINADO (lib/ms/assets.ts), que valida sesión + tipo/tamaño y FIJA el path
-- {user.id}/{uuid}.ext en el servidor; el cliente no elige carpeta. El bucket es PÚBLICO de LECTURA
-- (las <img> del correo cargan sin sesión). El saneador limita img[src] a https del bucket.
-- Idempotente. Si este INSERT falla con 42501 en tu proyecto, crea el bucket por la UI:
--   Storage → New bucket → name "ms_assets" → Public ✓.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('ms_assets', 'ms_assets', true)
on conflict (id) do update set public = true;
