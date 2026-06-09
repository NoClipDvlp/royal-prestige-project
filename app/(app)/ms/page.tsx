import Link from "next/link";
import { FileText, Users, Send, ScrollText } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { GlassCard } from "@/components/ui/card";

// Home del módulo de correo masivo (ADR-0027). Mapa de secciones. Las no construidas se marcan "próximamente"
// (se activan a medida que se entregan los bloques no-core).
const SECTIONS = [
  { href: "/ms/plantillas", title: "Plantillas", desc: "Correos reutilizables con campos {merge}.", icon: FileText, ready: true },
  { href: "/ms/destinatarios", title: "Destinatarios", desc: "Importa y gestiona listas (CSV).", icon: Users, ready: true },
  { href: "/ms/lotes", title: "Lotes", desc: "Arma, programa y envía campañas.", icon: Send, ready: true },
  { href: "/ms/logs", title: "Registro de envíos", desc: "Resultado por destinatario.", icon: ScrollText, ready: true },
] as const;

export default function MsHome() {
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Correo masivo" subtitle="Reclutamiento: importa, redacta, programa y envía." />
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const inner = (
            <GlassCard className={`flex h-full items-start gap-3 p-4 ${s.ready ? "transition hover:opacity-90" : "opacity-50"}`}>
              <span className="shrink-0 rounded-xl bg-accent/15 p-2 text-accent">
                <Icon size={20} />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-fg">
                  {s.title}
                  {!s.ready && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">próximamente</span>}
                </p>
                <p className="text-xs text-muted">{s.desc}</p>
              </div>
            </GlassCard>
          );
          return s.ready ? (
            <Link key={s.href} href={s.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={s.href}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
