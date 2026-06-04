import { getUser, requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
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
import type { TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

// Panel admin (ADR-0009). requireRole('admin') + datos vía sesión admin (RLS admin = ve todo).
export default async function AdminPage() {
  await requireRole("admin");
  const me = await getUser();
  const supabase = await createSupabaseServerClient();

  const [usersRes, distRes, catRes, tplRes] = await Promise.all([
    supabase.from("users").select("id, full_name, email, role, distribution_id"),
    supabase.from("distributions").select("id, name"),
    supabase.from("task_categories").select("id, name").eq("scope", "global"),
    // Plantillas + items (RLS admin; 0008). Graceful: si 0008 no está aplicado → data null → lista vacía.
    supabase
      .from("task_templates")
      .select(
        "id, name, description, template_items(id, title, category_id, priority, recurrence, time_slot, duration_minutes)",
      )
      .is("deleted_at", null)
      .order("created_at"),
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
        }),
      )
      .sort((a, b) => (a.timeSlot ?? "99:99").localeCompare(b.timeSlot ?? "99:99")),
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Administración" subtitle="Usuarios, distribuciones, categorías y plantillas." />
      <CreateUser />
      <UsersManager users={users} distributions={distributions} currentAdminId={me?.id ?? ""} />
      <DistributionsManager distributions={distributions} />
      <CategoriesManager categories={categories} />
      <TemplatesManager templates={templates} categories={categories} />
    </div>
  );
}
