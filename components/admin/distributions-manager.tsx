"use client";

import { useState, useTransition, type FormEvent } from "react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDistribution } from "@/lib/actions/admin";

export function DistributionsManager({ distributions }: { distributions: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    start(async () => {
      const r = await createDistribution(name.trim());
      if (!r.ok) setErr(r.error ?? "Error");
      else setName("");
    });
  }

  return (
    <GlassCard className="p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg">Distribuciones</h2>
      <ul className="mb-3 space-y-1 text-sm text-fg">
        {distributions.length ? (
          distributions.map((d) => <li key={d.id}>• {d.name}</li>)
        ) : (
          <li className="text-muted">Sin distribuciones aún.</li>
        )}
      </ul>
      <form onSubmit={handle} className="flex gap-2">
        <Input placeholder="Nueva distribución…" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <Button type="submit" disabled={pending}>Crear</Button>
      </form>
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
    </GlassCard>
  );
}
