"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  assignTemplate,
  previewTemplateAssignment,
  unassignTemplate,
  type AssignWarning,
} from "@/lib/actions/templates";

export type AsgDistributor = { id: string; name: string; distributionName: string };
export type AsgTemplate = { id: string; name: string };

const key = (t: string, u: string) => `${t}:${u}`;

type ConfirmState = {
  assign: { t: string; u: string }[];
  unassign: { t: string; u: string }[];
  warnings: AssignWarning[];
};

/**
 * Matriz distribuidores × plantillas (ADR-0015 Fase 2b). Toggle staged → "Aplicar cambios" → preview de
 * advertencias (advisory) → confirmar. Asignar=bulk insert (motor); quitar=soft-detach (KPI intacto).
 */
export function TemplateAssignment({
  distributors,
  templates,
  assigned,
}: {
  distributors: AsgDistributor[];
  templates: AsgTemplate[];
  assigned: string[];
}) {
  const router = useRouter();
  const base = useMemo(() => new Set(assigned), [assigned]);
  const [staged, setStaged] = useState<Map<string, boolean>>(new Map());
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const nameU = (u: string) => distributors.find((d) => d.id === u)?.name ?? "—";
  const nameT = (t: string) => templates.find((x) => x.id === t)?.name ?? "—";

  const isOn = (t: string, u: string) => {
    const k = key(t, u);
    return staged.has(k) ? (staged.get(k) as boolean) : base.has(k);
  };
  const toggle = (t: string, u: string) =>
    setStaged((prev) => {
      const k = key(t, u);
      const desired = !isOn(t, u);
      const next = new Map(prev);
      if (desired === base.has(k)) next.delete(k);
      else next.set(k, desired);
      return next;
    });
  const assignColumnAll = (t: string) =>
    setStaged((prev) => {
      const next = new Map(prev);
      for (const d of distributors) {
        const k = key(t, d.id);
        if (!base.has(k)) next.set(k, true);
        else next.delete(k);
      }
      return next;
    });

  const changes = [...staged.entries()];

  // distribuidores agrupados por distribución (para la lectura por fila)
  const groups = useMemo(() => {
    const m = new Map<string, AsgDistributor[]>();
    for (const d of distributors) m.set(d.distributionName, [...(m.get(d.distributionName) ?? []), d]);
    return [...m.entries()];
  }, [distributors]);

  function openConfirm() {
    const assign = changes.filter(([, v]) => v).map(([k]) => splitKey(k));
    const unassign = changes.filter(([, v]) => !v).map(([k]) => splitKey(k));
    setErr(null);
    start(async () => {
      const byT = new Map<string, string[]>();
      for (const a of assign) byT.set(a.t, [...(byT.get(a.t) ?? []), a.u]);
      const warnings: AssignWarning[] = [];
      for (const [t, us] of byT) {
        const r = await previewTemplateAssignment(t, us);
        if (r.ok && r.warnings) warnings.push(...r.warnings);
      }
      setConfirm({ assign, unassign, warnings });
    });
  }

  function apply() {
    if (!confirm) return;
    setErr(null);
    start(async () => {
      const byT = new Map<string, string[]>();
      for (const a of confirm.assign) byT.set(a.t, [...(byT.get(a.t) ?? []), a.u]);
      for (const [t, us] of byT) {
        const r = await assignTemplate(t, us);
        if (!r.ok) return setErr(r.error ?? "Error al asignar.");
      }
      for (const u of confirm.unassign) {
        const r = await unassignTemplate(u.t, u.u);
        if (!r.ok) return setErr(r.error ?? "Error al quitar.");
      }
      setConfirm(null);
      setStaged(new Map());
      router.refresh();
    });
  }

  if (templates.length === 0 || distributors.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="mb-1 text-sm font-semibold text-fg">Asignación</h2>
        <p className="text-sm text-muted">
          {templates.length === 0 ? "Crea una plantilla para poder asignarla." : "No hay distribuidores aún."}
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-fg">Asignación</h2>
        <p className="text-[11px] text-muted/70">Marca para asignar; los cambios se aplican al confirmar.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th className="px-2 py-2 text-left font-medium">Distribuidor</th>
              {templates.map((t) => (
                <th key={t.id} className="px-2 py-2 text-center font-medium">
                  <div className="text-fg">{t.name}</div>
                  <button type="button" onClick={() => assignColumnAll(t.id)} className="text-[10px] text-accent hover:underline">
                    todos
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([distName, members]) => (
              <DistGroup
                key={distName}
                distName={distName}
                members={members}
                templates={templates}
                isOn={isOn}
                isChanged={(t, u) => staged.has(key(t, u))}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      {changes.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/40 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <span className="text-xs text-muted">
            {changes.length} cambio{changes.length === 1 ? "" : "s"} pendiente{changes.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStaged(new Map())} className="h-8 text-xs">Descartar</Button>
            <Button onClick={openConfirm} disabled={pending} className="h-8 text-xs">Aplicar cambios ({changes.length})</Button>
          </div>
        </div>
      )}
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}

      {confirm && (
        <ConfirmModal
          confirm={confirm}
          nameU={nameU}
          nameT={nameT}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onApply={apply}
        />
      )}
    </GlassCard>
  );
}

function splitKey(k: string): { t: string; u: string } {
  const i = k.indexOf(":");
  return { t: k.slice(0, i), u: k.slice(i + 1) };
}

function DistGroup({
  distName,
  members,
  templates,
  isOn,
  isChanged,
  onToggle,
}: {
  distName: string;
  members: AsgDistributor[];
  templates: AsgTemplate[];
  isOn: (t: string, u: string) => boolean;
  isChanged: (t: string, u: string) => boolean;
  onToggle: (t: string, u: string) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={templates.length + 1} className="px-2 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted/70">
          {distName}
        </td>
      </tr>
      {members.map((d) => (
        <tr key={d.id} className="border-t border-white/40 dark:border-white/10">
          <td className="px-2 py-2.5 text-fg">{d.name}</td>
          {templates.map((t) => (
            <td key={t.id} className="px-2 py-2.5 text-center">
              <Cell on={isOn(t.id, d.id)} changed={isChanged(t.id, d.id)} onClick={() => onToggle(t.id, d.id)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Cell({ on, changed, onClick }: { on: boolean; changed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-md border transition",
        on && !changed && "border-transparent bg-accent text-accent-fg",
        on && changed && "border-accent bg-accent/30 text-accent ring-1 ring-accent",
        // #7: en claro el blanco no contrastaba → borde/relleno con el token fg (oscuro en claro); dark intacto.
        !on && changed && "border-red-400/70 bg-fg/[0.04] ring-1 ring-red-400/50 dark:bg-white/5",
        !on && !changed && "border-fg/30 bg-fg/[0.04] dark:border-white/20 dark:bg-white/5",
      )}
    >
      {on && <Check size={12} />}
    </button>
  );
}

function ConfirmModal({
  confirm,
  nameU,
  nameT,
  pending,
  onCancel,
  onApply,
}: {
  confirm: ConfirmState;
  nameU: (u: string) => string;
  nameT: (t: string) => string;
  pending: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const warnFor = (t: string, u: string) => confirm.warnings.filter((w) => w.userId === u);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <GlassCard className="w-full max-w-md p-6">
        <h2 className="mb-3 text-sm font-semibold text-fg">Confirmar cambios</h2>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {confirm.assign.map(({ t, u }) => (
            <div key={`a-${t}-${u}`} className="rounded-xl border border-white/60 bg-white/40 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-fg">
                Asignar <b>{nameT(t)}</b> → {nameU(u)}
              </p>
              {warnFor(t, u).map((w, i) => (
                <p key={i} className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">⚠ {w.detail}</p>
              ))}
            </div>
          ))}
          {confirm.unassign.map(({ t, u }) => (
            <div key={`u-${t}-${u}`} className="rounded-xl border border-white/60 bg-white/40 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-fg">
                Quitar <b>{nameT(t)}</b> → {nameU(u)}
              </p>
              <p className="mt-1 text-[11px] text-muted">Se archivan sus tareas de la plantilla; el histórico se conserva.</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
          <Button onClick={onApply} disabled={pending}>Confirmar</Button>
        </div>
      </GlassCard>
    </div>
  );
}
