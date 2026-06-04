"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { DENSITY_COOKIE, type Density } from "@/lib/density";

type DensityCtx = { density: Density; toggle: () => void };

const Ctx = createContext<DensityCtx>({ density: "comfortable", toggle: () => {} });

/**
 * Densidad GLOBAL del toggle del header (SPEC §8/§11). El estado inicial llega del server
 * (cookie leída en el layout (app)) → primer paint correcto, sin flash de hidratación. El toggle
 * persiste la elección en la misma cookie para futuras cargas/navegaciones.
 */
export function DensityProvider({ children, initial = "comfortable" }: { children: ReactNode; initial?: Density }) {
  const [density, setDensity] = useState<Density>(initial);
  const toggle = () =>
    setDensity((d) => {
      const next: Density = d === "compact" ? "comfortable" : "compact";
      document.cookie = `${DENSITY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
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
