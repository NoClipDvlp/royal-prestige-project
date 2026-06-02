"use client";

import { GlassCard } from "@/components/ui/card";
import { PageTitle } from "@/components/page-title";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DensityToggle, useDensity } from "@/components/ui/density";
import { cn } from "@/lib/cn";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";

export default function AjustesPage() {
  const { density } = useDensity();
  const gap = density === "compact" ? "gap-3" : "gap-5";
  const pad = density === "compact" ? "p-4" : "p-6";
  const row = "flex items-center justify-between gap-4";

  return (
    <div className={cn("flex flex-col", gap)}>
      <PageTitle title="Ajustes" subtitle="Preferencias. Mock — sin persistencia real aún." />

      <GlassCard className={cn(pad, "flex flex-col gap-5")}>
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

      <GlassCard className={pad}>
        <p className="text-sm font-semibold text-fg">Cuenta</p>
        <p className="mt-1 text-sm text-muted">
          Login, perfil, foto y conexión con Google llegan en el hito de autenticación.
        </p>
      </GlassCard>
    </div>
  );
}
