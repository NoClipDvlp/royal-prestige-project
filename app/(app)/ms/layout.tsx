import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getMsEnabled } from "@/lib/ms/guard";

// Gate de RUTA del módulo MS (ADR-0027 §2): si el módulo no está habilitado, la sección no responde.
// Defensa en profundidad sobre la RLS de ms_* (que ya devuelve 0 filas) y el ocultado del tab en el nav.
export default async function MsLayout({ children }: { children: ReactNode }) {
  if (!(await getMsEnabled())) redirect("/");
  return <>{children}</>;
}
