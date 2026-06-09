"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Copy, Trash2, X, AlertTriangle } from "lucide-react";
import { GlassCard, ModalCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { addRecipient, updateRecipient, deleteRecipient, duplicateRecipient } from "@/lib/ms/datasets";
import type { MsDataset, MsRecipient } from "@/lib/ms/types";

export function RecipientsManager({
  dataset,
  recipients,
}: {
  dataset: MsDataset;
  recipients: MsRecipient[];
}) {
  const router = useRouter();
  const cols = dataset.columns?.fields ?? [];
  const [editing, setEditing] = useState<MsRecipient | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function dup(id: string) {
    start(async () => {
      const r = await duplicateRecipient(id);
      if (!r.ok) toast(r.error ?? "No se pudo duplicar.", "error");
      else {
        toast("Destinatario duplicado.");
        router.refresh();
      }
    });
  }

  function del(id: string) {
    start(async () => {
      const r = await deleteRecipient(id, dataset.id);
      if (!r.ok) toast(r.error ?? "No se pudo eliminar.", "error");
      else {
        toast("Destinatario eliminado.");
        setConfirmId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {recipients.length} destinatario{recipients.length === 1 ? "" : "s"}
        </p>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} /> Agregar
        </Button>
      </div>

      {recipients.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-muted">La lista está vacía. Agrega un destinatario.</GlassCard>
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/40 text-muted dark:bg-white/5">
              <tr>
                {cols.map((c) => (
                  <th key={c} className={`px-3 py-2 font-medium ${c === dataset.columns.emailField ? "text-accent" : ""}`}>
                    {c}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id} className="border-t border-white/40 dark:border-white/10">
                  {cols.map((c) => (
                    <td key={c} className="px-3 py-1.5 text-fg">
                      {c === dataset.columns.emailField && !r.email_valid ? (
                        <span className="inline-flex items-center gap-1 text-red-500">
                          <AlertTriangle size={12} /> {r.fields?.[c] ?? r.email}
                        </span>
                      ) : (
                        r.fields?.[c] ?? ""
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(r)} aria-label="Editar" className="rounded-lg p-1.5 text-muted transition hover:text-fg">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => dup(r.id)} disabled={pending} aria-label="Duplicar" className="rounded-lg p-1.5 text-muted transition hover:text-fg">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => setConfirmId(r.id)} aria-label="Eliminar" className="rounded-lg p-1.5 text-red-500 transition hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}

      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setConfirmId(null);
          }}
        >
          <ModalCard className="w-full max-w-xs p-5">
            <p className="text-sm text-fg">¿Eliminar este destinatario?</p>
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

      {(adding || editing) && (
        <RecipientEditor
          dataset={dataset}
          recipient={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RecipientEditor({
  dataset,
  recipient,
  onClose,
  onSaved,
}: {
  dataset: MsDataset;
  recipient: MsRecipient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cols = dataset.columns?.fields ?? [];
  const emailField = dataset.columns.emailField;
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const c of cols) base[c] = recipient?.fields?.[c] ?? "";
    return base;
  });
  const [pending, start] = useTransition();
  const email = (fields[emailField] ?? "").trim();

  function setField(c: string, v: string) {
    setFields((f) => ({ ...f, [c]: v }));
  }

  function save() {
    start(async () => {
      const r = recipient
        ? await updateRecipient(recipient.id, { email, fields })
        : await addRecipient(dataset.id, { email, fields });
      if (!r.ok) toast(r.error ?? "No se pudo guardar.", "error");
      else {
        toast(recipient ? "Destinatario actualizado." : "Destinatario agregado.");
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
      <ModalCard className="flex max-h-[90vh] w-full max-w-md flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">{recipient ? "Editar destinatario" : "Agregar destinatario"}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {cols.map((c) => (
            <label key={c} className="block space-y-1">
              <span className="px-1 text-[11px] text-muted">
                {c}
                {c === emailField && <span className="ml-1 text-accent">(correo)</span>}
              </span>
              <Input
                value={fields[c] ?? ""}
                onChange={(e) => setField(c, e.target.value)}
                type={c === emailField ? "email" : "text"}
                placeholder={c}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !email} onClick={save}>
            {recipient ? "Guardar" : "Agregar"}
          </Button>
        </div>
      </ModalCard>
    </div>
  );
}
