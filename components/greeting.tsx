"use client";

import { useEffect, useState } from "react";

function partOfDay(hour: number): string {
  if (hour < 12) return "buenos días";
  if (hour < 20) return "buenas tardes";
  return "buenas noches";
}

/** Saludo estilo Apple (SPEC §11) con datos REALES. La franja se calcula en cliente (evita desajuste SSR). */
export function Greeting({ name, goalPct, pending }: { name: string; goalPct: number; pending: number }) {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);

  const greet = hour === null ? null : partOfDay(hour);
  const greetCap = greet ? greet.charAt(0).toUpperCase() + greet.slice(1) : "Hola";

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted">{greetCap}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        Hola {name}
        {greet ? `, ${greet}.` : "."}
      </h1>
      <p className="text-base text-muted">
        Vas en <span className="font-semibold text-fg">{goalPct}%</span> de tu meta semanal — te faltan{" "}
        <span className="font-semibold text-fg">{pending}</span> pendientes.
      </p>
    </div>
  );
}
