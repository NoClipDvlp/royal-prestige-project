"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useDensity } from "@/components/ui/density";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { densityClasses, ROW_HOVER } from "@/lib/density";
import { createDistribution, updateDistribution, deleteDistribution } from "@/lib/actions/admin";

type Dist = { id: string; name: string };

export function DistributionsManager({ distributions }: { distributions: Dist[] }) {
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
      const r = await createDistribution(name.trim());
      if (!r.ok) setErr(r.error ?? "Error");
      else setName("");
    });
  }

  return (
    <GlassCard className={d.cardPad}>
      <h2 className="mb-3 text-sm font-semibold text-fg">Distribuciones</h2>
      <ul className="mb-3 flex flex-col gap-0.5 text-sm text-fg">
        {distributions.length ? (
          distributions.map((dist) => <DistRow key={dist.id} dist={dist} />)
        ) : (
          <li className="px-1 py-1.5 text-muted">Sin distribuciones aún.</li>
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

function DistRow({ dist }: { dist: Dist }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dist.name);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!name.trim()) return;
    setErr(null);
    start(async () => {
      const r = await updateDistribution(dist.id, name.trim());
      if (!r.ok) setErr(r.error ?? "Error");
      else setEditing(false);
    });
  }

  function remove() {
    if (!window.confirm(`¿Eliminar la distribución "${dist.name}"?`)) return;
    setErr(null);
    start(async () => {
      const r = await deleteDistribution(dist.id);
      if (!r.ok) setErr(r.error ?? "Error");
    });
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 px-1 py-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" aria-label="Nombre de la distribución" autoFocus />
        <Button size="icon" onClick={save} disabled={pending || !name.trim()} aria-label="Guardar"><Check size={16} /></Button>
        <Button variant="secondary" size="icon" onClick={() => { setEditing(false); setName(dist.name); setErr(null); }} disabled={pending} aria-label="Cancelar"><X size={16} /></Button>
      </li>
    );
  }

  return (
    <li className={cn("rounded-lg", ROW_HOVER)}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="flex-1 truncate">{dist.name}</span>
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} disabled={pending} aria-label={`Renombrar ${dist.name}`} className="text-muted hover:text-fg">
          <Pencil size={15} />
        </Button>
        <Button variant="danger" size="icon" onClick={remove} disabled={pending} aria-label={`Eliminar ${dist.name}`}>
          <Trash2 size={15} />
        </Button>
      </div>
      {err ? <p className="px-2 pb-1.5 text-[11px] text-red-500">{err}</p> : null}
    </li>
  );
}
