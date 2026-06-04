"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useDensity } from "@/components/ui/density";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { densityClasses } from "@/lib/density";
import { createGlobalCategory } from "@/lib/actions/admin";

export function CategoriesManager({ categories }: { categories: { id: string; name: string }[] }) {
  const { density } = useDensity();
  const d = densityClasses(density);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    start(async () => {
      const r = await createGlobalCategory(name.trim(), null);
      if (!r.ok) setErr(r.error ?? "Error");
      else setName("");
    });
  }

  return (
    <GlassCard className={d.cardPad}>
      <h2 className="mb-3 text-sm font-semibold text-fg">Categorías globales</h2>
      <ul className="mb-3 flex flex-wrap gap-2 text-sm">
        {categories.length ? (
          categories.map((c) => (
            <li key={c.id} className={cn("rounded-full glass text-fg", d.compact ? "px-2.5 py-0.5" : "px-3 py-1")}>
              {c.name}
            </li>
          ))
        ) : (
          <li className="text-muted">Sin categorías globales aún.</li>
        )}
      </ul>
      <form onSubmit={handle} className="flex gap-2">
        <Input placeholder="Nueva categoría global…" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <Button type="submit" disabled={pending}>Crear</Button>
      </form>
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
    </GlassCard>
  );
}
