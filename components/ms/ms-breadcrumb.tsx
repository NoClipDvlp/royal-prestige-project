import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Migas de pan de la sección Correos (#2): siempre arranca en "Correos" (/ms) → navegación clara + volver. */
export function MsBreadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  const trail = [{ label: "Correos", href: "/ms" }, ...items];
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted" aria-label="Ruta de navegación">
      {trail.map((it, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${it.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="opacity-50" />}
            {it.href && !last ? (
              <Link href={it.href} className="transition hover:text-fg">
                {it.label}
              </Link>
            ) : (
              <span className={last ? "font-medium text-fg" : ""}>{it.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
