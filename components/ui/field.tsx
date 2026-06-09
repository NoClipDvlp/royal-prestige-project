import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Campo de formulario (patrón #1 QA Tanda 2): label ENCIMA + control + hint/error.
 * Visible en formularios verticales (auth, modales, create); en filas inline densas se usa aria-label
 * en el control y se omite el label visible. El placeholder se mantiene como ejemplo/ayuda.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="px-1 text-xs font-medium text-muted">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="px-1 text-[11px] text-red-500">{error}</p>
      ) : hint ? (
        <p className="px-1 text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
