"use client";

import { Bell } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DensityToggle } from "@/components/ui/density";
import { LogoutButton } from "@/components/auth/logout-button";

/** Header estilo app iOS: barra translúcida pegajosa con blur. */
export function AppHeader() {
  return (
    <header className="ios-bar sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-2">
          <DensityToggle />
          <Button variant="secondary" size="icon" aria-label="Notificaciones" className="relative">
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
          </Button>
          <ThemeToggle />
          <LogoutButton iconOnly />
        </div>
      </div>
    </header>
  );
}
