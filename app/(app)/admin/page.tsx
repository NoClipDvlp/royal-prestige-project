import { requireRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { CreateUser } from "@/components/admin/create-user";
import { UsersManager, type AdminUser, type Dist } from "@/components/admin/users-manager";
import { DistributionsManager } from "@/components/admin/distributions-manager";
import { CategoriesManager } from "@/components/admin/categories-manager";

// Panel admin (ADR-0009). requireRole('admin') + datos vía sesión admin (RLS admin = ve todo).
export default async function AdminPage() {
  await requireRole("admin");
  const supabase = await createSupabaseServerClient();

  const [usersRes, distRes, catRes] = await Promise.all([
    supabase.from("users").select("id, full_name, email, role, distribution_id"),
    supabase.from("distributions").select("id, name"),
    supabase.from("task_categories").select("id, name").eq("scope", "global"),
  ]);

  const users = (usersRes.data ?? []) as unknown as AdminUser[];
  const distributions = (distRes.data ?? []) as unknown as Dist[];
  const categories = (catRes.data ?? []) as unknown as { id: string; name: string }[];

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Administración" subtitle="Usuarios, distribuciones y categorías globales." />
      <CreateUser />
      <UsersManager users={users} distributions={distributions} />
      <DistributionsManager distributions={distributions} />
      <CategoriesManager categories={categories} />
    </div>
  );
}
