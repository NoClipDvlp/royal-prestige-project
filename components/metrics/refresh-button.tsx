"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Refresco LOCAL de métricas (Pulido Tanda 4). router.refresh() re-ejecuta los server components de la
 * RUTA ACTUAL (re-consulta ranking/serie en el server y reconcilia el RSC) SIN recargar la página ni
 * navegar — y preserva el estado de los client components (rango/grano/dimensión seleccionados). El
 * useTransition expone isPending → spinner sutil mientras el RSC se vuelve a resolver.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-label="Refrescar métricas"
      title="Refrescar"
      className="text-muted hover:text-fg"
    >
      <RefreshCw size={16} className={cn(pending && "animate-spin text-fg")} aria-hidden />
    </Button>
  );
}
