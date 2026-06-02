-- ============================================================================
-- Royal Control — 0001_auditor_labels  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: db/migrations/). Autorizado por ADR-0005.
-- Cambios requieren ADR + [CORE-APPROVED: ADR-XXXX].
--
-- DEBT-0004: el auditor leía la fila COMPLETA de users (email/phone/photo_url/preferences/
-- auth_providers = PII). Decisión (ADR-0005): el auditor lee SOLO labels (full_name +
-- distribution_id) vía esta vista, y se le retira el SELECT sobre la tabla users cruda.
-- ============================================================================

-- Vista de labels para admin/auditor.
--
-- ⚠ DEFINER A PROPÓSITO (security_invoker = false): la vista corre como su owner y BYPASSA la
-- RLS de users para poder ver TODAS las distribuciones. Es necesario porque al auditor se le
-- quita el SELECT-RLS sobre users (abajo): con security_invoker = true vería 0 filas.
-- El CONTROL DE ACCESO es el WHERE de rol + security_barrier + la proyección de columnas + el grant:
--   • WHERE auth.current_role() in ('admin','auditor')  → distributor y role=null obtienen 0 filas.
--   • security_barrier = true                            → impide pushdown de predicados del usuario
--                                                          por debajo del gate (evita fugas).
--   • proyección id/full_name/distribution_id            → CERO PII.
-- NOTA: el linter de Supabase marcará "security definer view" como warning. Es INTENCIONAL y
-- está mitigado por lo anterior. No cambiar a security_invoker = true (rompería al auditor).
create view public.users_labels
  with (security_barrier = true, security_invoker = false) as
  select id, full_name, distribution_id
  from public.users
  where auth.current_role() in ('admin', 'auditor');

grant select on public.users_labels to authenticated, service_role;  -- anon: sin acceso

-- Retirar al auditor el acceso a la tabla users cruda (queda: admin OR la propia fila).
-- El auditor arma el ranking con metric_snapshots ⨝ users_labels ⨝ distributions.
alter policy users_select on public.users
  using ( auth.current_role() = 'admin' or id = (select auth.uid()) );
