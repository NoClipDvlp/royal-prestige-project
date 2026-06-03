"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, ListTodo, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AppRole } from "@/lib/auth/server";

type Tab = { href: string; label: string; icon: ComponentType<{ size?: number }> };

const DISTRIBUTOR: Tab[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/tareas", label: "Tareas", icon: ListTodo },
  { href: "/metricas", label: "Métricas", icon: BarChart3 },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];
const ADMIN: Tab[] = [
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/metricas", label: "Métricas", icon: BarChart3 },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];
const AUDITOR: Tab[] = [
  { href: "/metricas", label: "Métricas", icon: BarChart3 },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

function tabsFor(role: AppRole | null): Tab[] {
  if (role === "admin") return ADMIN;
  if (role === "auditor") return AUDITOR;
  return DISTRIBUTOR; // distributor (y por defecto)
}

/** Tab bar flotante glass, role-aware (ADR-0009). */
export function AppNav({ role }: { role: AppRole | null }) {
  const pathname = usePathname();
  const tabs = tabsFor(role);
  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="glass flex items-center gap-1 rounded-full p-1.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium transition",
                active ? "bg-accent text-accent-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              <Icon size={18} />
              <span className={cn(active ? "inline" : "hidden sm:inline")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
