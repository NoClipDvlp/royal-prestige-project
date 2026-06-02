"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const LOGO_SRC = "/royal-prestige-logo.png";

/**
 * Marca Royal Prestige. Usa el asset oficial (/royal-prestige-logo.png); si aún no está
 * en disco, cae a un monograma "RP" para no romper el build mientras se dropea el archivo.
 * El logo oficial es un círculo (león azul sobre blanco, borde plateado): el contenedor
 * le da un anillo sutil y, en oscuro, un halo suave para que el blanco no contraste de más
 * — sin alterar el asset.
 */
export function Logo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {!failed ? (
        <img
          src={LOGO_SRC}
          alt="Royal Prestige"
          width={36}
          height={36}
          onError={() => setFailed(true)}
          className={cn(
            "h-9 w-9 rounded-full object-cover",
            "ring-1 ring-black/5 dark:ring-white/20",
            "dark:shadow-[0_0_0_4px_rgba(255,255,255,0.04)]",
          )}
        />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg shadow-sm">
          RP
        </span>
      )}
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-fg">Royal Prestige</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Royal Control</span>
      </span>
    </span>
  );
}
