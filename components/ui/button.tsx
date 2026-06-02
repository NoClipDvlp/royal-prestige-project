import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "glass" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-sm hover:brightness-110",
  glass: "glass text-fg hover:scale-[1.02]",
  ghost: "text-fg hover:bg-white/40 dark:hover:bg-white/10",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
