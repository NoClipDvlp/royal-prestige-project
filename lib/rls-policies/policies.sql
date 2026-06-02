-- ============================================================================
-- Royal Control — RLS policies  (NÚCLEO / CORE)
-- ============================================================================
-- ⚠ ARCHIVO CORE (.coreignore: lib/rls-policies/). Autorizado por ADR-0003.
-- Implementa la matriz rol×tabla×verbo del ADR-0003. Se aplica DESPUÉS de 0000_init.sql.
--
-- Principios (ADR-0003, no negociables):
--   • ENABLE + FORCE RLS en TODAS las tablas (incl. vacías post-MVP). service_role bypassa.
--   • Default-deny: sin policy que matchee → denegado. jd/seller sin policy → deny.
--   • Identidad vía helpers auth.current_role() / auth.current_distribution() (SECURITY DEFINER).
--   • TODA policy de negocio exige rol específico (admin/auditor/distributor). La ÚNICA
--     cosa que un usuario role=null puede leer es su propia fila en `users`.
--   • Anti-recursión: la self-policy de users usa `id = (select auth.uid())` directo.
-- ============================================================================

-- Activar + forzar RLS en todas las tablas de negocio
do $$
declare t text;
begin
  foreach t in array array[
    'distributions','users','distribution_owners','org_hierarchy','task_categories',
    'tasks','task_instances','metric_snapshots','calendar_links',
    'calendar_sync_conflicts','notifications'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force  row level security;', t);
  end loop;
end $$;

-- ============================ distributions ============================
create policy distributions_select on distributions for select using (
  auth.current_role() in ('admin','auditor')
  or (auth.current_role() = 'distributor' and id = auth.current_distribution())
);
create policy distributions_insert on distributions for insert
  with check (auth.current_role() = 'admin');
create policy distributions_update on distributions for update
  using (auth.current_role() = 'admin') with check (auth.current_role() = 'admin');
create policy distributions_delete on distributions for delete
  using (auth.current_role() = 'admin');

-- ============================ users ============================
-- SELECT: admin o la PROPIA fila (role=null incluido → única lectura permitida).
-- El AUDITOR ya NO lee la tabla users cruda (PII): sus labels van por la vista users_labels
-- (db/migrations/0001_auditor_labels.sql, ADR-0005 / DEBT-0004).
-- (Snapshot de referencia; la verdad aplicable a una DB desplegada es la migración 0001.)
create policy users_select on users for select using (
  auth.current_role() = 'admin'
  or id = (select auth.uid())
);
-- INSERT: solo admin (alta de perfiles; el alta por signup la hace service_role/trigger).
create policy users_insert on users for insert
  with check (auth.current_role() = 'admin');
-- UPDATE: admin (cualquiera) o self. El cambio de role/distribution_id propio lo BLOQUEA
-- el trigger forbid_self_privilege_escalation (defensa adicional a nivel columna).
create policy users_update on users for update
  using (auth.current_role() = 'admin' or id = (select auth.uid()))
  with check (auth.current_role() = 'admin' or id = (select auth.uid()));
create policy users_delete on users for delete
  using (auth.current_role() = 'admin');

-- ============================ distribution_owners ============================
create policy downers_select on distribution_owners for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and distribution_id = auth.current_distribution())
);
create policy downers_insert on distribution_owners for insert
  with check (auth.current_role() = 'admin');
create policy downers_update on distribution_owners for update
  using (auth.current_role() = 'admin') with check (auth.current_role() = 'admin');
create policy downers_delete on distribution_owners for delete
  using (auth.current_role() = 'admin');

-- ============================ org_hierarchy (post-MVP, vacía pero protegida) ============================
create policy orgh_select on org_hierarchy for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and distribution_id = auth.current_distribution())
);
create policy orgh_insert on org_hierarchy for insert
  with check (auth.current_role() = 'admin');
create policy orgh_update on org_hierarchy for update
  using (auth.current_role() = 'admin') with check (auth.current_role() = 'admin');
create policy orgh_delete on org_hierarchy for delete
  using (auth.current_role() = 'admin');

-- ============================ task_categories ============================
-- SELECT: admin todo; distributor ve globales + las propias. (auditor: nada)
create policy cat_select on task_categories for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor'
      and (scope = 'global' or owner_user_id = (select auth.uid())))
);
-- INSERT: admin crea globales; distributor crea personales propias.
create policy cat_insert on task_categories for insert with check (
  (auth.current_role() = 'admin' and scope = 'global' and owner_user_id is null
     and created_by = (select auth.uid()))
  or (auth.current_role() = 'distributor' and scope = 'personal'
     and owner_user_id = (select auth.uid()) and created_by = (select auth.uid()))
);
create policy cat_update on task_categories for update using (
  (auth.current_role() = 'admin' and scope = 'global')
  or (auth.current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
) with check (
  (auth.current_role() = 'admin' and scope = 'global')
  or (auth.current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
);
create policy cat_delete on task_categories for delete using (
  (auth.current_role() = 'admin' and scope = 'global')
  or (auth.current_role() = 'distributor' and scope = 'personal' and owner_user_id = (select auth.uid()))
);

-- ============================ tasks (distributor = SELF) ============================
create policy tasks_select on tasks for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
create policy tasks_insert on tasks for insert with check (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor'
      and owner_user_id = (select auth.uid())
      and distribution_id = auth.current_distribution())
);
create policy tasks_update on tasks for update using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and owner_user_id = (select auth.uid()))
) with check (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor'
      and owner_user_id = (select auth.uid())
      and distribution_id = auth.current_distribution())
);
create policy tasks_delete on tasks for delete using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);

-- ============================ task_instances (distributor = SELECT/UPDATE self) ============================
create policy ti_select on task_instances for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
-- INSERT/DELETE: solo admin (la materialización diaria la hace el job vía service_role).
create policy ti_insert on task_instances for insert
  with check (auth.current_role() = 'admin');
create policy ti_update on task_instances for update using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and owner_user_id = (select auth.uid()))
) with check (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and owner_user_id = (select auth.uid()))
);
create policy ti_delete on task_instances for delete
  using (auth.current_role() = 'admin');

-- ============================ metric_snapshots ============================
-- SELECT: admin + AUDITOR (todas) + el dueño. INSERT: admin (y service_role job). U/D: nadie (append-only).
create policy snap_select on metric_snapshots for select using (
  auth.current_role() in ('admin','auditor')
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy snap_insert on metric_snapshots for insert
  with check (auth.current_role() = 'admin');
-- (sin policies de UPDATE/DELETE → default-deny; además el trigger append-only bloquea a todos)

-- ============================ calendar_links (distributor CRUD self) ============================
create policy callinks_select on calendar_links for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy callinks_insert on calendar_links for insert with check (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy callinks_update on calendar_links for update using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy callinks_delete on calendar_links for delete using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);

-- ============================ calendar_sync_conflicts (distributor SELECT/UPDATE self) ============================
create policy conflicts_select on calendar_sync_conflicts for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy conflicts_insert on calendar_sync_conflicts for insert
  with check (auth.current_role() = 'admin');
create policy conflicts_update on calendar_sync_conflicts for update using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy conflicts_delete on calendar_sync_conflicts for delete
  using (auth.current_role() = 'admin');

-- ============================ notifications (distributor SELECT/UPDATE self) ============================
create policy notif_select on notifications for select using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy notif_insert on notifications for insert
  with check (auth.current_role() = 'admin');
create policy notif_update on notifications for update using (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
) with check (
  auth.current_role() = 'admin'
  or (auth.current_role() = 'distributor' and user_id = (select auth.uid()))
);
create policy notif_delete on notifications for delete
  using (auth.current_role() = 'admin');
