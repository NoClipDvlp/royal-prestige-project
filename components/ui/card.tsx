import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Tarjeta glass: borde blanco + sombra flotante + desenfoque (sin bordes de color). */
export function GlassCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-3xl", className)} {...props} />;
}
