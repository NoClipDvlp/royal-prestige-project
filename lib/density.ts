// Sistema de densidad global (Pulido Tanda 3). Una sola fuente para las clases por densidad → las listas
// consumen tokens (d.rowPad, d.title, d.showSecondary…) en vez de repetir `compact ? … : …` por todos lados.
// Persistencia: cookie SSR-safe (el layout server la lee → primer paint correcto, sin flash de hidratación).

export type Density = "compact" | "comfortable";

export const DENSITY_COOKIE = "rc-density";

/** Hover sutil para filas de lista accionables (Tanda 5). No depende de densidad. */
export const ROW_HOVER = "transition-colors hover:bg-white/40 dark:hover:bg-white/5";

/** Normaliza el valor de la cookie (server o client). Default: ampliada (comfortable). */
export function parseDensity(value: string | null | undefined): Density {
  return value === "compact" ? "compact" : "comfortable";
}

export type DensityTokens = {
  compact: boolean;
  sectionGap: string; // gap entre tarjetas/secciones en una columna
  cardPad: string; // padding de tarjeta de sección (managers, breakdown, plantillas)
  listPad: string; // padding de tarjeta-lista con filas divididas (today, ranking)
  rowPad: string; // padding por fila
  rowGap: string; // gap horizontal dentro de fila / vertical entre filas simples
  title: string; // tipografía del título primario de fila
  meta: string; // tipografía de metadatos
  /** Mostrar metadatos secundarios de CONTEXTO (dot de prioridad, counts, labels, hora-rango inline).
   *  Regla del sistema: compacta NUNCA quita título ni acción/estado — solo este contexto. */
  showSecondary: boolean;
  timelineRowH: number; // alto por hora en el timeline de DayView (px)
};

const COMFORTABLE: DensityTokens = {
  compact: false,
  sectionGap: "gap-5",
  cardPad: "p-6",
  listPad: "p-2",
  rowPad: "px-3 py-3",
  rowGap: "gap-3",
  title: "text-sm sm:text-base",
  meta: "text-xs",
  showSecondary: true,
  timelineRowH: 72,
};

const COMPACT: DensityTokens = {
  compact: true,
  sectionGap: "gap-3",
  cardPad: "p-4",
  listPad: "p-1.5",
  rowPad: "px-2 py-1.5",
  rowGap: "gap-2",
  title: "text-sm",
  meta: "text-[10px]",
  showSecondary: false,
  timelineRowH: 56,
};

/** Clases/medidas por densidad. Llamar una vez por componente: `const d = densityClasses(density)`. */
export function densityClasses(density: Density): DensityTokens {
  return density === "compact" ? COMPACT : COMFORTABLE;
}
