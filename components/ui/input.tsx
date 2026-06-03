import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-white/70 bg-white/50 px-4 py-2.5 text-sm text-fg outline-none transition",
        "placeholder:text-muted focus:ring-2 focus:ring-accent/40",
        "dark:border-white/10 dark:bg-white/5",
        className,
      )}
      {...props}
    />
  );
}
