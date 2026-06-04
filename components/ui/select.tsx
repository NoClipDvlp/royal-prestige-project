import type { Ref, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Select cohesivo: espeja al Input (mismo radio rounded-2xl, borde, fondo y ring de :focus). Conserva el
 * :focus ring (campos siempre muestran foco al enfocar, no solo con teclado). Sin `w-full` por defecto
 * (los selects viven a veces en rejillas/filas inline); el caller añade `w-full` donde lo necesite.
 */
export function Select({
  className,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select
      ref={ref}
      className={cn(
        "rounded-2xl border border-white/70 bg-white/50 px-3 py-2.5 text-sm text-fg outline-none transition",
        "focus:ring-2 focus:ring-accent/40",
        "dark:border-white/10 dark:bg-white/5",
        className,
      )}
      {...props}
    />
  );
}
