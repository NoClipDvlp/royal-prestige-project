"use client";

import { cn } from "@/lib/cn";

/** Control segmentado glass (toggle de rango/granularidad). Genérico sobre el valor (string). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="glass inline-flex items-center gap-0.5 rounded-full p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              active ? "bg-accent text-accent-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
