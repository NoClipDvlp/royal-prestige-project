"use client";

import { Bell } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DensityToggle } from "@/components/ui/density";

/** Header estilo app iOS: barra translúcida pegajosa con blur. */
export function AppHeader() {
  return (
    <header className="ios-bar sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-2">
          <DensityToggle />
          <button
            type="button"
            aria-label="Notificaciones"
            className="relative grid h-9 w-9 place-items-center rounded-full glass text-fg transition hover:scale-105 active:scale-95"
          >
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
