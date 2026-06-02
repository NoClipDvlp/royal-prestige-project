import type { ReactNode } from "react";
import { DensityProvider } from "@/components/ui/density";
import { AppHeader } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";

/** Shell de la app autenticada (mock por ahora): header iOS + contenido + tab bar flotante. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DensityProvider>
      <AppHeader />
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6">{children}</div>
      <AppNav />
    </DensityProvider>
  );
}
