import { Suspense } from "react";
import { getUser, requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { RefreshButton } from "@/components/metrics/refresh-button";
import { AdminContentSkeleton } from "@/components/skeletons";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { CreateUser } from "@/components/admin/create-user";
import { UsersManager, type AdminUser, type Dist } from "@/components/admin/users-manager";
import { DistributionsManager } from "@/components/admin/distributions-manager";
import { CategoriesManager } from "@/components/admin/categories-manager";
import {
  TemplatesManager,
  type AdminTemplate,
  type AdminTemplateItem,
  type CatOption,
} from "@/components/admin/templates-manager";
import { TemplateAssignment, type AsgDistributor } from "@/components/admin/template-assignment";
import type { TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

// Panel admin (ADR-0009 + ADR-0015 Fase 2b). requireRole('admin') + datos vía sesión admin (RLS admin).
// Reorganizado en tabs (Usuarios / Organización / Plantillas) — agrupa los managers existentes sin reescribirlos.
// El guard de rol corre primero (rápido, memoizado); el título sale ya y el fetch pesado (5 queries) streamea.
export default async function AdminPage() {
  await requireRole("admin");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <PageTitle title="Administración" subtitle="Usuarios, organización y plantillas." />
        <RefreshButton label="Refrescar" />
      </div>
      <Suspense fallback={<AdminContentSkeleton />}>
        <AdminData />
      </Suspense>
    </div>
  );
}

async function AdminData() {
  const me = await getUser();
  const supabase = await createSupabaseServerClient();

  const [usersRes, distRes, catRes, tplRes, asgRes] = await Promise.all([
    supabase.from("users").select("id, full_name, email, role, distribution_id"),
    supabase.from("distributions").select("id, name"),
    supabase.from("task_categories").select("id, name").eq("scope", "global"),
    supabase
      .from("task_templates")
      .select(
        "id, name, description, template_items(id, title, category_id, priority, recurrence, time_slot, duration_minutes, weekdays, emoji)",
      )
      .is("deleted_at", null)
      .order("created_at"),
    // Asignaciones activas (0008). Graceful: si 0008 no está aplicado → null → matriz vacía.
    supabase.from("template_assignments").select("template_id, user_id").eq("active", true),
  ]);

  const users = (usersRes.data ?? []) as unknown as AdminUser[];
  const distributions = (distRes.data ?? []) as unknown as Dist[];
  const categories = (catRes.data ?? []) as unknown as CatOption[];

  type ItemRaw = {
    id: string;
    title: string;
    category_id: string | null;
    priority: TaskPriority;
    recurrence: TaskRecurrence;
    time_slot: string | null;
    duration_minutes: number | null;
    weekdays: number[] | null;
    emoji: string | null;
  };
  type TplRaw = { id: string; name: string; description: string | null; template_items: ItemRaw[] | null };

  const templates: AdminTemplate[] = ((tplRes.data ?? []) as unknown as TplRaw[]).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    items: (t.template_items ?? [])
      .map(
        (i): AdminTemplateItem => ({
          id: i.id,
          title: i.title,
          categoryId: i.category_id,
          priority: i.priority,
          recurrence: i.recurrence,
          timeSlot: i.time_slot,
          durationMinutes: i.duration_minutes,
          weekdays: i.weekdays,
          emoji: i.emoji,
        }),
      )
      .sort((a, b) => (a.timeSlot ?? "99:99").localeCompare(b.timeSlot ?? "99:99")),
  }));

  // Asignación: distribuidores (con nombre de distribución) + set de asignaciones activas.
  const distName = new Map(distributions.map((d) => [d.id, d.name]));
  const distributors: AsgDistributor[] = users
    .filter((u) => u.role === "distributor")
    .map((u) => ({
      id: u.id,
      name: u.full_name ?? "—",
      distributionName: u.distribution_id ? distName.get(u.distribution_id) ?? "—" : "—",
    }));
  const assigned = ((asgRes.data ?? []) as unknown as { template_id: string; user_id: string }[]).map(
    (a) => `${a.template_id}:${a.user_id}`,
  );
  const asgTemplates = templates.map((t) => ({ id: t.id, name: t.name }));

  return (
    <AdminTabs
      tabs={[
          {
            id: "usuarios",
            label: "Usuarios",
            content: (
              <>
                <CreateUser distributions={distributions} />
                <UsersManager users={users} distributions={distributions} currentAdminId={me?.id ?? ""} />
              </>
            ),
          },
          {
            id: "organizacion",
            label: "Organización",
            content: (
              <>
                <DistributionsManager distributions={distributions} />
                <CategoriesManager categories={categories} />
              </>
            ),
          },
          {
            id: "plantillas",
            label: "Plantillas",
            content: (
              <>
                <TemplatesManager templates={templates} categories={categories} />
                <TemplateAssignment distributors={distributors} templates={asgTemplates} assigned={assigned} />
              </>
            ),
          },
      ]}
    />
  );
}
