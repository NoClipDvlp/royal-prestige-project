"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, Upload, Trash2, X, ChevronRight } from "lucide-react";
import { GlassCard, ModalCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { parseCsvFile, guessEmailField, buildRecipients, cleanRows, isValidEmail } from "@/lib/ms/csv";
import { createDataset, deleteDataset } from "@/lib/ms/datasets";
import type { MsDataset } from "@/lib/ms/types";

export function DatasetsManager({ datasets }: { datasets: MsDataset[] }) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function del(id: string) {
    start(async () => {
      const r = await deleteDataset(id);
      if (!r.ok) toast(r.error ?? "No se pudo eliminar.", "error");
      else {
        toast("Lista eliminada.");
        setConfirmId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setImporting(true)}>
          <Upload size={16} /> Importar CSV
        </Button>
      </div>

      {datasets.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-muted">
          Aún no tienes listas. Importa un CSV con columnas como Nombre, Apellido y Correo.
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {datasets.map((d) => (
            <GlassCard key={d.id} className="flex items-center gap-3 p-3">
              <span className="shrink-0 rounded-lg bg-accent/15 p-2 text-accent">
                <Users size={16} />
              </span>
              <Link href={`/ms/destinatarios/${d.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{d.name}</p>
                <p className="truncate text-xs text-muted">
                  {d.recipient_count} destinatario{d.recipient_count === 1 ? "" : "s"}
                  {d.source_filename ? ` · ${d.source_filename}` : ""}
                </p>
              </Link>
              <button onClick={() => setConfirmId(d.id)} aria-label="Eliminar" className="shrink-0 rounded-lg p-2 text-red-500 transition hover:text-red-600">
                <Trash2 size={15} />
              </button>
              <Link href={`/ms/destinatarios/${d.id}`} aria-label="Abrir" className="shrink-0 rounded-lg p-2 text-muted transition hover:text-fg">
                <ChevronRight size={16} />
              </Link>
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
            <p className="text-sm text-fg">¿Eliminar esta lista?</p>
            <p className="mt-1 text-xs text-muted">Los destinatarios se ocultan; las campañas previas conservan su registro.</p>
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

      {importing && (
        <DatasetImporter
          onClose={() => setImporting(false)}
          onSaved={() => {
            setImporting(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DatasetImporter({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]); // editable antes de guardar (#1)
  const [fileName, setFileName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emailField, setEmailField] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setParseError(null);
    try {
      const p = await parseCsvFile(file);
      if (p.headers.length === 0 || p.rows.length === 0) {
        setParseError("El archivo no tiene filas o cabeceras legibles.");
        return;
      }
      const cleaned = cleanRows(p.headers, p.rows); // #1: Title Case nombres + trim + hora canónica
      setHeaders(p.headers);
      setRows(cleaned);
      setFileName(file.name);
      setName(file.name.replace(/\.csv$/i, ""));
      setEmailField(guessEmailField(p.headers, cleaned));
    } catch {
      setParseError("No se pudo leer el CSV. Verifica el formato.");
    }
  }

  function setCell(rowIdx: number, header: string, value: string) {
    setRows((rs) => rs.map((row, j) => (j === rowIdx ? { ...row, [header]: value } : row)));
  }

  const loaded = headers.length > 0;
  const summary = loaded && emailField ? buildRecipients(rows, emailField) : null;
  const validCount = summary ? summary.recipients.filter((r) => r.valid).length : 0;

  function save() {
    if (!loaded || !emailField || !summary) return;
    start(async () => {
      const r = await createDataset({
        name,
        columns: { fields: headers, emailField },
        recipients: summary.recipients,
        sourceFilename: fileName,
      });
      if (!r.ok) toast(r.error ?? "No se pudo guardar.", "error");
      else {
        toast(`Lista creada · ${summary.recipients.length} destinatarios.`);
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
          <h2 className="text-sm font-semibold text-fg">Importar destinatarios (CSV)</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {!loaded ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-white/60 bg-white/40 py-10 text-sm text-muted transition hover:text-fg dark:border-white/15 dark:bg-white/5"
            >
              <Upload size={22} />
              Elegir archivo CSV
              <span className="text-[11px]">columnas: Nombre, Apellido, Correo, …</span>
            </button>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="px-1 text-[11px] text-muted">Nombre de la lista</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Candidatos 11am" />
                </label>
                <label className="block space-y-1">
                  <span className="px-1 text-[11px] text-muted">Columna de correo</span>
                  <Select className="w-full" value={emailField} onChange={(e) => setEmailField(e.target.value)}>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              {summary && (
                <p className="text-xs text-muted">
                  {rows.length} filas → <span className="text-fg">{validCount} válidos</span>
                  {summary.invalid > 0 && <span className="text-red-500"> · {summary.invalid} inválidos</span>}
                  {summary.duplicates > 0 && <span> · {summary.duplicates} duplicados omitidos</span>}
                  {" · "}limpieza aplicada (nombres, espacios, hora); edítala abajo si hace falta.
                </p>
              )}

              <div className="max-h-72 overflow-auto rounded-2xl border border-white/60 dark:border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white/70 text-muted backdrop-blur dark:bg-[#10131c]">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className={`px-3 py-2 font-medium ${h === emailField ? "text-accent" : ""}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const badEmail = !isValidEmail(r[emailField] ?? "");
                      return (
                        <tr key={i} className="border-t border-white/40 dark:border-white/10">
                          {headers.map((h) => (
                            <td key={h} className="p-0">
                              <input
                                value={r[h] ?? ""}
                                onChange={(e) => setCell(i, h, e.target.value)}
                                aria-label={`${h} fila ${i + 1}`}
                                className={`w-full bg-transparent px-3 py-1.5 text-xs outline-none transition focus:bg-accent/5 ${
                                  h === emailField && badEmail ? "text-red-500" : "text-fg"
                                }`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {parseError && <p className="text-xs text-red-500">{parseError}</p>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !loaded || !name.trim() || validCount === 0} onClick={save}>
            Guardar lista
          </Button>
        </div>
      </ModalCard>
    </div>
  );
}
