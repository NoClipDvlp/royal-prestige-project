"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type Density = "compact" | "comfortable";
type DensityCtx = { density: Density; toggle: () => void };

const Ctx = createContext<DensityCtx>({ density: "comfortable", toggle: () => {} });

/** Patrón "vista compacta / ampliada" (SPEC §8/§11) vía contexto + data-attribute. */
export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<Density>("comfortable");
  const toggle = () =>
    setDensity((d) => (d === "compact" ? "comfortable" : "compact"));
  return (
    <Ctx.Provider value={{ density, toggle }}>
      <div data-density={density}>{children}</div>
    </Ctx.Provider>
  );
}

export const useDensity = (): DensityCtx => useContext(Ctx);

export function DensityToggle() {
  const { density, toggle } = useDensity();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar densidad de la vista"
      className="grid h-9 w-9 place-items-center rounded-full glass text-fg transition hover:scale-105 active:scale-95"
    >
      {density === "compact" ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
    </button>
  );
}
