import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { DensityProvider } from "@/components/ui/density";
import { AppHeader } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";
import { Toaster } from "@/lib/toast";
import { getProfile } from "@/lib/auth/server";
import { DENSITY_COOKIE, parseDensity } from "@/lib/density";

/** Shell de la app: header iOS + contenido + tab bar flotante ROLE-AWARE (ADR-0009). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // must_set_password (ADR-0022): el gate de set-password lo hace AHORA el middleware (columna fresca, cubre
  // todas las rutas + server actions). Se eliminó la intercepción del layout (Opción L de ADR-0020 revertida).
  const { role } = await getProfile();
  // Densidad desde cookie (SSR) → el provider arranca con el valor correcto, sin flash.
  const density = parseDensity((await cookies()).get(DENSITY_COOKIE)?.value);
  return (
    <DensityProvider initial={density}>
      <AppHeader />
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6">{children}</div>
      <AppNav role={role} />
      <Toaster />
    </DensityProvider>
  );
}
