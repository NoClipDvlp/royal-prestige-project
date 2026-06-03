import { requireRole } from "@/lib/auth/server";
import { PageTitle } from "@/components/page-title";
import { GlassCard } from "@/components/ui/card";

// Placeholder del panel admin (gateado por rol). El CRUD real llega en la Parte B (ADR-0009).
export default async function AdminPage() {
  await requireRole("admin"); // no-admin → redirige (defensa; la RLS además no le da datos)

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Administración" subtitle="Usuarios, distribuciones y categorías globales." />
      <GlassCard className="p-6">
        <p className="text-sm text-muted">
          Panel de administración — <span className="font-medium text-fg">en construcción (Parte B)</span>:
          gestión de usuarios (asignar rol/distribución con tu sesión), distribuciones y categorías globales,
          y alta/reset de usuarios.
        </p>
      </GlassCard>
    </div>
  );
}
