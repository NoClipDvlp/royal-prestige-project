-- 0017_revoke_materialize_day.sql — ADR-0026 (SEGURIDAD): cerrar el EXECUTE público de materialize_day.
--
-- public.materialize_day(date) es SECURITY DEFINER (0003) y quedó con el ACL por defecto = EXECUTE a PUBLIC
-- → cualquier rol `authenticated` podía invocarla por RPC y sembrar task_instances de TODA la organización
-- (cross-tenant) y degradar el KPI ajeno (instancias status_pct=0 en días pasados). Ningún server action la
-- usa. La materialización diaria la ejecuta el cron como OWNER (no necesita el grant público).

revoke execute on function public.materialize_day(date) from public, authenticated;
