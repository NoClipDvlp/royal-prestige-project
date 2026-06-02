import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { GlassCard } from "@/components/ui/card";

/** Layout centrado del flujo de auth (sin nav de app): logo + tarjeta glass + toggle de tema. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Logo />
      <GlassCard className="w-full max-w-sm p-7">
        <div className="mb-5 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </GlassCard>
      {footer ? <div className="text-sm text-muted">{footer}</div> : null}
    </main>
  );
}
