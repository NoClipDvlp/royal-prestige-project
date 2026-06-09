import { GlassCard } from "@/components/ui/card";
import { PageTitle } from "@/components/page-title";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DensityToggle } from "@/components/ui/density";
import { LogoutButton } from "@/components/auth/logout-button";
import { ChangePassword } from "@/components/account/change-password";
import { getProfile, getUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  auditor: "Auditor",
  distributor: "Distribuidor",
  jd: "Jefe de distribución",
  seller: "Vendedor",
};

/** Ajustes (#10): Cuenta (perfil + cambiar contraseña + logout) + Preferencias (tema/densidad/franja). */
export default async function AjustesPage() {
  const user = await getUser();
  const { role, distributionId } = await getProfile();
  const name = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";

  let distributionName: string | null = null;
  if (distributionId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("distributions").select("name").eq("id", distributionId).maybeSingle();
    distributionName = (data?.name as string | undefined) ?? null;
  }

  const row = "flex items-center justify-between gap-4";
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Ajustes" subtitle="Tu cuenta y preferencias." />

      {/* Cuenta */}
      <GlassCard className="flex flex-col gap-5 p-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Cuenta</p>
          <h2 className="mt-1 text-lg font-semibold text-fg">{name}</h2>
          <p className="text-sm text-muted">{email}</p>
          <p className="mt-1 text-sm text-muted">
            {role ? ROLE_LABEL[role] ?? role : "Sin rol"}
            {distributionName ? ` · ${distributionName}` : ""}
          </p>
        </div>

        <div className="border-t border-white/40 pt-4 dark:border-white/10">
          <p className="mb-2 text-sm font-medium text-fg">Cambiar contraseña</p>
          <ChangePassword />
        </div>

        <div className="flex justify-start border-t border-white/40 pt-4 dark:border-white/10">
          <LogoutButton />
        </div>
      </GlassCard>

      {/* Preferencias */}
      <GlassCard className="flex flex-col gap-5 p-6">
        <p className="text-xs uppercase tracking-wide text-muted">Preferencias</p>
        <div className={row}>
          <div>
            <p className="text-sm font-medium text-fg">Tema</p>
            <p className="text-xs text-muted">Claro u oscuro</p>
          </div>
          <ThemeToggle />
        </div>
        <div className={row}>
          <div>
            <p className="text-sm font-medium text-fg">Densidad</p>
            <p className="text-xs text-muted">Vista compacta o ampliada</p>
          </div>
          <DensityToggle />
        </div>
        <div className={row}>
          <div>
            <p className="text-sm font-medium text-fg">Franja horaria</p>
            <p className="text-xs text-muted">
              {String(WORKDAY_START).padStart(2, "0")}:00 – {String(WORKDAY_END).padStart(2, "0")}:00
            </p>
          </div>
          <span className="text-xs text-muted">Global (MVP)</span>
        </div>
      </GlassCard>
    </div>
  );
}
