"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Copy, Pencil, Trash2, X } from "lucide-react";
import { GlassCard, ModalCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  createMsTemplate,
  updateMsTemplate,
  deleteMsTemplate,
  duplicateMsTemplate,
} from "@/lib/ms/templates";
import { extractTokens, renderHtmlBody, renderSubject } from "@/lib/ms/render";
import type { MsTemplate } from "@/lib/ms/types";

/** CRUD de plantillas MS: lista + crear/editar (con preview de merge) + duplicar + eliminar. */
export function MsTemplatesManager({ templates }: { templates: MsTemplate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MsTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function dup(id: string) {
    start(async () => {
      const r = await duplicateMsTemplate(id);
      if (!r.ok) toast(r.error ?? "No se pudo duplicar.", "error");
      else {
        toast("Plantilla duplicada.");
        router.refresh();
      }
    });
  }

  function del(id: string) {
    start(async () => {
      const r = await deleteMsTemplate(id);
      if (!r.ok) toast(r.error ?? "No se pudo eliminar.", "error");
      else {
        toast("Plantilla eliminada.");
        setConfirmId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva plantilla
        </Button>
      </div>

      {templates.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-muted">
          Aún no tienes plantillas. Crea la primera para empezar a enviar.
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <GlassCard key={t.id} className="flex items-center gap-3 p-3">
              <span className="shrink-0 rounded-lg bg-accent/15 p-2 text-accent">
                <FileText size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.subject}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => setEditing(t)} aria-label="Editar" className="rounded-lg p-2 text-muted transition hover:text-fg">
                  <Pencil size={15} />
                </button>
                <button onClick={() => dup(t.id)} disabled={pending} aria-label="Duplicar" className="rounded-lg p-2 text-muted transition hover:text-fg">
                  <Copy size={15} />
                </button>
                <button onClick={() => setConfirmId(t.id)} aria-label="Eliminar" className="rounded-lg p-2 text-red-500 transition hover:text-red-600">
                  <Trash2 size={15} />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setConfirmId(null);
          }}
        >
          <ModalCard className="w-full max-w-xs p-5">
            <p className="text-sm text-fg">¿Eliminar esta plantilla?</p>
            <p className="mt-1 text-xs text-muted">Las campañas que ya la usaron conservan su copia.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmId(null)}>
                Cancelar
              </Button>
              <Button variant="danger" disabled={pending} onClick={() => del(confirmId)}>
                Eliminar
              </Button>
            </div>
          </ModalCard>
        </div>
      )}

      {(creating || editing) && (
        <TemplateEditor
          template={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: MsTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body_html ?? "<p>Hola {Nombre},</p>\n<p>Nos encantaría conversar contigo.</p>");
  const [pending, start] = useTransition();

  const tokens = Array.from(new Set([...extractTokens(subject), ...extractTokens(body)]));
  const sample: Record<string, string> = Object.fromEntries(tokens.map((k) => [k, k])); // demo: {Nombre} → "Nombre"
  const previewSubject = renderSubject(subject, sample);
  const previewBody = renderHtmlBody(body, sample);

  function save() {
    start(async () => {
      const r = template
        ? await updateMsTemplate(template.id, { name, subject, bodyHtml: body })
        : await createMsTemplate({ name, subject, bodyHtml: body });
      if (!r.ok) toast(r.error ?? "No se pudo guardar.", "error");
      else {
        toast(template ? "Plantilla actualizada." : "Plantilla creada.");
        onSaved();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <ModalCard className="flex max-h-[90vh] w-full max-w-2xl flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">{template ? "Editar plantilla" : "Nueva plantilla"}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          <label className="block space-y-1">
            <span className="px-1 text-[11px] text-muted">Nombre</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Invitación a reclutamiento" />
          </label>
          <label className="block space-y-1">
            <span className="px-1 text-[11px] text-muted">Asunto</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Hola {Nombre}, una oportunidad para ti" />
          </label>
          <label className="block space-y-1">
            <span className="px-1 text-[11px] text-muted">Cuerpo (HTML — usa {"{Campo}"} para personalizar por destinatario)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full rounded-2xl border border-white/70 bg-white/50 px-4 py-2.5 font-mono text-xs text-fg outline-none transition focus:ring-2 focus:ring-accent/40 dark:border-white/10 dark:bg-white/5"
            />
          </label>

          {tokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">Campos detectados:</span>
              {tokens.map((t) => (
                <span key={t} className="rounded-lg bg-accent/15 px-2 py-0.5 text-[11px] text-accent">{`{${t}}`}</span>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <span className="px-1 text-[11px] text-muted">Vista previa (con valores de ejemplo)</span>
            <div className="rounded-2xl border border-white/60 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="mb-2 text-xs font-semibold text-fg">
                {previewSubject || <span className="text-muted">(asunto vacío)</span>}
              </p>
              <div className="max-w-none text-sm text-fg [&_p]:my-1" dangerouslySetInnerHTML={{ __html: previewBody }} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !name.trim() || !subject.trim() || !body.trim()} onClick={save}>
            {template ? "Guardar" : "Crear"}
          </Button>
        </div>
      </ModalCard>
    </div>
  );
}
