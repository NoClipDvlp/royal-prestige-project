import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Tarjeta glass: borde blanco + sombra flotante + desenfoque (sin bordes de color). */
export function GlassCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-3xl", className)} {...props} />;
}

/** Tarjeta OPACA para modales/diálogos (ADR-0023): superficie sólida (no translúcida) + borde + sombra.
 *  El contenido detrás del modal NO se lee a través — para confirmaciones/formularios en overlay. */
export function ModalCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("modal-surface rounded-3xl", className)} {...props} />;
}
