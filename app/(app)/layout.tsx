import type { ReactNode } from "react";
import { DensityProvider } from "@/components/ui/density";
import { AppHeader } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";
import { getProfile } from "@/lib/auth/server";

/** Shell de la app: header iOS + contenido + tab bar flotante ROLE-AWARE (ADR-0009). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { role } = await getProfile();
  return (
    <DensityProvider>
      <AppHeader />
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6">{children}</div>
      <AppNav role={role} />
    </DensityProvider>
  );
}
