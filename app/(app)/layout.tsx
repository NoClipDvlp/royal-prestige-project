import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DensityProvider } from "@/components/ui/density";
import { AppHeader } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";
import { Toaster } from "@/lib/toast";
import { getProfile, getUser } from "@/lib/auth/server";
import { DENSITY_COOKIE, parseDensity } from "@/lib/density";

/** Shell de la app: header iOS + contenido + tab bar flotante ROLE-AWARE (ADR-0009). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // B1 (ADR-0020): si el usuario debe fijar su contraseña (alta/reset por admin), se le FUERZA la pantalla
  // de establecerla antes de usar la app. El flag vive en app_metadata (no editable por el cliente) y se lee
  // del getUser() validado. /auth/* está fuera de este grupo → la pantalla de set-password es alcanzable.
  const user = await getUser();
  if (user?.app_metadata?.must_set_password) redirect("/auth/reset?mode=update");

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
