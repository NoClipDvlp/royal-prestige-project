"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Plus, Copy, X, Clock, Ban, ChevronRight, FlaskConical } from "lucide-react";
import { GlassCard, ModalCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  createCampaign,
  sendCampaign,
  scheduleCampaign,
  duplicateCampaign,
  cancelCampaign,
  testSendTemplate,
  listRecipientsForCampaign,
  type Assignment,
} from "@/lib/ms/campaigns";
import { CAMPAIGN_STATUS_LABEL, type MsCampaign } from "@/lib/ms/types";
import type { BuilderDataset, BuilderTemplate } from "@/app/(app)/ms/lotes/page";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-white/40 text-muted dark:bg-white/10",
  scheduled: "bg-accent/15 text-accent",
  sending: "bg-accent/15 text-accent",
  sent: "bg-positive/15 text-positive",
  partial: "bg-amber-500/15 text-amber-600",
  failed: "bg-red-500/15 text-red-600",
  canceled: "bg-white/40 text-muted dark:bg-white/10",
};

export function CampaignsManager({
  campaigns,
  datasets,
  templates,
}: {
  campaigns: MsCampaign[];
  datasets: BuilderDataset[];
  templates: BuilderTemplate[];
}) {
  const router = useRouter();
  const [building, setBuilding] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dsName = useMemo(() => new Map(datasets.map((d) => [d.id, d.name])), [datasets]);
  const tplName = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);

  const canBuild = datasets.length > 0 && templates.length > 0;

  function act(fn: () => Promise<{ ok: boolean; error?: string; sent?: number; failed?: number; skipped?: number }>, okMsg: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Operación fallida.", "error");
      else {
        const detail =
          r.sent != null ? ` (${r.sent} enviados${r.failed ? `, ${r.failed} fallidos` : ""}${r.skipped ? `, ${r.skipped} omitidos` : ""})` : "";
        toast(okMsg + detail);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        <Button variant="glass" onClick={() => setTesting(true)} disabled={templates.length === 0}>
          <FlaskConical size={16} /> Probar envío
        </Button>
        <Button onClick={() => setBuilding(true)} disabled={!canBuild}>
          <Plus size={16} /> Nuevo lote
        </Button>
      </div>

      {!canBuild && (
        <GlassCard className="p-4 text-center text-xs text-muted">
          Para armar un lote necesitas al menos una lista de destinatarios y una plantilla.
        </GlassCard>
      )}

      {campaigns.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-muted">Aún no has creado lotes.</GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {campaigns.map((c) => (
            <GlassCard key={c.id} className="flex items-center gap-3 p-3">
              <Link href={`/ms/lotes/${c.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[c.status] ?? ""}`}>
                    {CAMPAIGN_STATUS_LABEL[c.status]}
                  </span>
                  <p className="truncate text-sm font-medium text-fg">
                    {c.dataset_id ? dsName.get(c.dataset_id) ?? "Lista" : "Lista"}
                    <span className="text-muted"> · {c.template_id ? tplName.get(c.template_id) ?? "Plantilla" : "Plantilla"}</span>
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {c.total_count} destinatario{c.total_count === 1 ? "" : "s"} · {c.sent_count} enviados
                  {c.failed_count > 0 ? ` · ${c.failed_count} fallidos` : ""}
                  {c.status === "scheduled" && c.scheduled_at ? ` · programado ${new Date(c.scheduled_at).toLocaleString()}` : ""}
                </p>
              </Link>

              <div className="flex shrink-0 items-center gap-1">
                {["draft", "scheduled", "partial", "failed"].includes(c.status) && (
                  <button
                    onClick={() => act(() => sendCampaign(c.id), "Lote enviado")}
                    disabled={pending}
                    aria-label="Enviar"
                    className="rounded-lg p-2 text-accent transition hover:opacity-80"
                  >
                    <Send size={15} />
                  </button>
                )}
                {["draft", "scheduled", "partial", "failed"].includes(c.status) && (
                  <button onClick={() => setScheduleId(c.id)} disabled={pending} aria-label="Programar" className="rounded-lg p-2 text-muted transition hover:text-fg">
                    <Clock size={15} />
                  </button>
                )}
                <button onClick={() => act(() => duplicateCampaign(c.id), "Lote duplicado")} disabled={pending} aria-label="Duplicar" className="rounded-lg p-2 text-muted transition hover:text-fg">
                  <Copy size={15} />
                </button>
                {["draft", "scheduled"].includes(c.status) && (
                  <button onClick={() => act(() => cancelCampaign(c.id), "Lote cancelado")} disabled={pending} aria-label="Cancelar" className="rounded-lg p-2 text-red-500 transition hover:text-red-600">
                    <Ban size={15} />
                  </button>
                )}
                <Link href={`/ms/lotes/${c.id}`} aria-label="Detalle" className="rounded-lg p-2 text-muted transition hover:text-fg">
                  <ChevronRight size={16} />
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {building && (
        <CampaignBuilder
          datasets={datasets}
          templates={templates}
          onClose={() => setBuilding(false)}
          onSaved={() => {
            setBuilding(false);
            router.refresh();
          }}
        />
      )}
      {testing && (
        <TestSend
          datasets={datasets}
          templates={templates}
          onClose={() => setTesting(false)}
        />
      )}
      {scheduleId && (
        <ScheduleModal
          onClose={() => setScheduleId(null)}
          onSaved={() => {
            setScheduleId(null);
            router.refresh();
          }}
          campaignId={scheduleId}
        />
      )}
    </div>
  );
}

type Mode = "all" | "subset" | "split";

function CampaignBuilder({
  datasets,
  templates,
  onClose,
  onSaved,
}: {
  datasets: BuilderDataset[];
  templates: BuilderTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [templateIdB, setTemplateIdB] = useState(templates[1]?.id ?? templates[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("all");
  const [recipients, setRecipients] = useState<{ id: string; email: string; valid: boolean }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  // Carga los destinatarios del dataset elegido (al montar y al cambiar de lista).
  useEffect(() => {
    if (!datasetId) return;
    let cancel = false;
    setLoading(true);
    listRecipientsForCampaign(datasetId).then((r) => {
      if (cancel) return;
      setRecipients(r);
      setSelected(new Set(r.map((x) => x.id)));
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [datasetId]);

  const chosen =
    mode === "subset" ? recipients.filter((r) => selected.has(r.id)) : recipients;
  const count = chosen.length;
  const over = count > 100;

  function build() {
    if (!datasetId || !templateId || count === 0) return;
    const assignments: Assignment[] = chosen.map((r, i) => ({
      recipientId: r.id,
      templateId: mode === "split" ? (i % 2 === 0 ? templateId : templateIdB) : templateId,
    }));
    start(async () => {
      const res = await createCampaign({ datasetId, defaultTemplateId: templateId, assignments });
      if (!res.ok) toast(res.error ?? "No se pudo crear el lote.", "error");
      else {
        toast(`Lote creado · ${assignments.length} destinatarios.`);
        onSaved();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalCard className="flex max-h-[90vh] w-full max-w-lg flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Nuevo lote</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          <label className="block space-y-1">
            <span className="px-1 text-[11px] text-muted">Lista de destinatarios</span>
            <Select
              className="w-full"
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.recipient_count})
                </option>
              ))}
            </Select>
          </label>

          {loading && <p className="text-xs text-muted">Cargando destinatarios…</p>}

          <label className="block space-y-1">
            <span className="px-1 text-[11px] text-muted">Asignación de plantilla</span>
            <Select className="w-full" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="all">La misma a todos</option>
              <option value="subset">Solo a una selección</option>
              <option value="split">Dividir A/B (alterna por fila)</option>
            </Select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="px-1 text-[11px] text-muted">{mode === "split" ? "Plantilla A (pares)" : "Plantilla"}</span>
              <Select className="w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </label>
            {mode === "split" && (
              <label className="block space-y-1">
                <span className="px-1 text-[11px] text-muted">Plantilla B (impares)</span>
                <Select className="w-full" value={templateIdB} onChange={(e) => setTemplateIdB(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          {mode === "subset" && recipients.length > 0 && (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-2xl border border-white/60 p-2 dark:border-white/10">
              {recipients.map((r) => (
                <label key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      });
                    }}
                  />
                  <span className={`truncate ${r.valid ? "text-fg" : "text-red-500"}`}>{r.email}</span>
                </label>
              ))}
            </div>
          )}

          <p className={`text-xs ${over ? "text-red-500" : "text-muted"}`}>
            {count} destinatario{count === 1 ? "" : "s"} en el lote
            {over ? " · máximo 100 por lote" : ""}
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={pending || !datasetId || !templateId || count === 0 || over} onClick={build}>
            Crear lote
          </Button>
        </div>
      </ModalCard>
    </div>
  );
}

function ScheduleModal({ campaignId, onClose, onSaved }: { campaignId: string; onClose: () => void; onSaved: () => void }) {
  const [when, setWhen] = useState("");
  const [pending, start] = useTransition();
  function save() {
    if (!when) return;
    start(async () => {
      const iso = new Date(when).toISOString();
      const r = await scheduleCampaign(campaignId, iso);
      if (!r.ok) toast(r.error ?? "No se pudo programar.", "error");
      else {
        toast("Lote programado.");
        onSaved();
      }
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalCard className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Programar envío</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg"><X size={18} /></button>
        </div>
        <label className="block space-y-1">
          <span className="px-1 text-[11px] text-muted">Fecha y hora</span>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <p className="mt-2 text-[11px] text-muted">Se enviará cuando entres a Lotes después de esa hora (dispatch al estar activo).</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={pending || !when} onClick={save}>Programar</Button>
        </div>
      </ModalCard>
    </div>
  );
}

function TestSend({ datasets, templates, onClose }: { datasets: BuilderDataset[]; templates: BuilderTemplate[]; onClose: () => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [datasetId, setDatasetId] = useState("");
  const [pending, start] = useTransition();
  function run() {
    if (!templateId) return;
    start(async () => {
      const r = await testSendTemplate({ templateId, datasetId: datasetId || null });
      if (!r.ok) toast(r.error ?? "No se pudo enviar la prueba.", "error");
      else {
        toast("Correo de prueba enviado a tu dirección.");
        onClose();
      }
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalCard className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Probar envío</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="px-1 text-[11px] text-muted">Plantilla</span>
            <Select className="w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="px-1 text-[11px] text-muted">Datos de ejemplo (opcional)</span>
            <Select className="w-full" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
              <option value="">Sin lista (usa los nombres de campo)</option>
              {datasets.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </Select>
          </label>
          <p className="text-[11px] text-muted">Se envía a tu propio correo de cuenta para revisar el formato.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={pending || !templateId} onClick={run}>Enviar prueba</Button>
        </div>
      </ModalCard>
    </div>
  );
}
