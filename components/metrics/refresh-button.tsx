"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Evento global de refresco: los componentes client-fetch (UserTasks, carga-premium…) lo escuchan y
 *  re-disparan su carga. router.refresh() solo re-renderiza server components → no bastaba para ellos. */
export const RC_REFRESH_EVENT = "rc:refresh";

/**
 * Refresco LOCAL (ADR-0031): router.refresh() re-ejecuta los server components de la ruta actual SIN recargar
 * la página, y ADEMÁS dispara RC_REFRESH_EVENT para que los componentes que cargan en el CLIENTE (UserTasks,
 * carga-premium) vuelvan a pedir sus datos (router.refresh no re-dispara sus fetch). Así admin/auditor ven el
 * estado vivo tras refrescar, sin quedar con data vieja. useTransition → spinner mientras resuelve.
 */
export function RefreshButton({ label = "Refrescar métricas" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={() =>
        start(() => {
          router.refresh();
          if (typeof window !== "undefined") window.dispatchEvent(new Event(RC_REFRESH_EVENT));
        })
      }
      disabled={pending}
      aria-label={label}
      title="Refrescar"
      className="text-muted hover:text-fg"
    >
      <RefreshCw size={16} className={cn(pending && "animate-spin text-fg")} aria-hidden />
    </Button>
  );
}
