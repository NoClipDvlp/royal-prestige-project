"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const pill = "grid h-9 w-9 place-items-center rounded-full glass text-fg transition hover:scale-105 active:scale-95";

/** Toggle claro/oscuro. Guarda contra desajuste de hidratación con `mounted`. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Cambiar tema claro/oscuro"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(pill)}
    >
      {mounted ? (
        isDark ? <Sun size={18} /> : <Moon size={18} />
      ) : (
        <Sun size={18} className="opacity-0" />
      )}
    </button>
  );
}
