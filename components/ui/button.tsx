import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// `glass` se mantiene como alias de `secondary` (compat: 9 usos en el repo).
type Variant = "primary" | "secondary" | "glass" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg elev-1 hover:brightness-110",
  secondary: "glass text-fg hover:scale-[1.02]",
  glass: "glass text-fg hover:scale-[1.02]",
  ghost: "text-fg hover:bg-white/40 dark:hover:bg-white/10",
  // Danger TONAL (no rojo sólido chillón): coherente con la paleta premium.
  danger: "bg-red-500/10 text-red-500 hover:bg-red-500/15 dark:text-red-400",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1 rounded-2xl px-3 text-xs",
  md: "h-9 gap-1.5 rounded-2xl px-4 text-sm",
  icon: "h-9 w-9 rounded-full", // botón-icono circular (header, flechas, toggles)
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition active:scale-95 disabled:opacity-50 disabled:active:scale-100",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
