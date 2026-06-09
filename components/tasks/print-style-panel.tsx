"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Printer, ChevronLeft, ChevronRight, Download, RotateCcw, Type, Minus, Plus } from "lucide-react";

/**
 * Panel de edición de la vista de IMPRESIÓN (no-print). Edita EN VIVO (sin recargar) la tipografía del
 * cronograma vía variables CSS sobre `.rc-print`: familia, y tamaño + color de Títulos / Encabezados /
 * Descripciones. Persiste en localStorage (sobrevive a cambiar de semana). Además: navegación de semana
 * (plantilla), descargar como imagen (PNG alta resolución) e imprimir.
 */

const FONTS: { label: string; value: string }[] = [
  { label: "Sistema", value: "" },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  { label: "Redondeada", value: '"SF Pro Rounded", "Segoe UI", system-ui, sans-serif' },
  { label: "Grotesk", value: '"Helvetica Neue", Arial, sans-serif' },
  { label: "Mono", value: "ui-monospace, Menlo, Consolas, monospace" },
];

type Style = {
  ff: string;
  fsTitle: number;
  fsHead: number;
  fsDesc: number;
  cTitle: string;
  cHead: string;
  cDesc: string;
};
const DEFAULTS: Style = { ff: "", fsTitle: 1, fsHead: 1, fsDesc: 1, cTitle: "#1b1f2e", cHead: "#1b1f2e", cDesc: "#1b1f2e" };
const KEY = "rc-print-style";

function applyStyle(s: Style) {
  const el = document.querySelector<HTMLElement>(".rc-print");
  if (!el) return;
  const set = (k: string, v: string, def: string) => (v && v !== def ? el.style.setProperty(k, v) : el.style.removeProperty(k));
  set("--ff", s.ff, "");
  set("--fs-title", String(s.fsTitle), "1");
  set("--fs-head", String(s.fsHead), "1");
  set("--fs-desc", String(s.fsDesc), "1");
  set("--c-title", s.cTitle, DEFAULTS.cTitle);
  set("--c-head", s.cHead, DEFAULTS.cHead);
  set("--c-desc", s.cDesc, DEFAULTS.cDesc);
}

export function PrintStylePanel({
  prevHref,
  nextHref,
  weekLabel,
}: {
  prevHref?: string;
  nextHref?: string;
  weekLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Style>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  // cargar preferencias guardadas (sobrevive a cambiar de semana)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
    loaded.current = true;
  }, []);

  // aplicar + guardar en cada cambio (y re-aplicar tras remontar por navegación de semana)
  useEffect(() => {
    applyStyle(s);
    if (loaded.current) {
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* noop */
      }
    }
  }, [s]);

  const upd = (patch: Partial<Style>) => setS((prev) => ({ ...prev, ...patch }));
  const clampSize = (v: number) => Math.min(1.8, Math.max(0.7, Math.round(v * 10) / 10));

  async function downloadImage() {
    const node = document.querySelector<HTMLElement>(".rc-page");
    if (!node) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 3, backgroundColor: "#ffffff", style: { boxShadow: "none", margin: "0" } });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "cronograma-semanal.png";
      a.click();
    } catch {
      /* si falla, queda Imprimir → Guardar como PDF */
    } finally {
      setBusy(false);
    }
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="no-print fixed left-1/2 top-3 z-50 flex w-[min(94vw,560px)] -translate-x-1/2 flex-col items-stretch">
      {/* barra superior */}
      <div className="flex items-center gap-1 rounded-full bg-white px-2 py-1.5 shadow-lg ring-1 ring-black/10">
        {prevHref && nextHref ? (
          <>
            <Link href={prevHref} aria-label="Semana anterior" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
              <ChevronLeft size={16} />
            </Link>
            <span className="px-1 text-xs font-medium text-[#1b1f2e]">{weekLabel}</span>
            <Link href={nextHref} aria-label="Semana siguiente" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
              <ChevronRight size={16} />
            </Link>
            <span className="mx-1 h-4 w-px bg-black/10" />
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-black/10 ${open ? "bg-[#6d6cf0] text-white ring-transparent" : "text-[#1b1f2e] hover:bg-black/5"}`}
        >
          <Type size={14} /> Personalizar
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={downloadImage}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#1b1f2e] ring-1 ring-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            <Download size={14} /> {busy ? "Generando…" : "Imagen"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#6d6cf0] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Printer size={14} /> Imprimir
          </button>
        </div>
      </div>

      {/* panel desplegable */}
      {open ? (
        <div className="mt-2 rounded-2xl bg-white p-3 text-[#1b1f2e] shadow-xl ring-1 ring-black/10">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7286]">Tipografía</span>
            <select
              value={s.ff}
              onChange={(e) => upd({ ff: e.target.value })}
              className="ml-auto rounded-lg border border-black/10 px-2 py-1 text-xs"
              aria-label="Familia tipográfica"
            >
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setS(DEFAULTS)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#6b7286] ring-1 ring-black/10 hover:bg-black/5"
            >
              <RotateCcw size={12} /> Restablecer
            </button>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[#6b7286]">
                <th className="pb-1 font-semibold">Elemento</th>
                <th className="pb-1 text-center font-semibold">Tamaño</th>
                <th className="pb-1 text-center font-semibold">Color</th>
              </tr>
            </thead>
            <tbody>
              {([
                { label: "Títulos", size: "fsTitle", color: "cTitle" },
                { label: "Encabezados", size: "fsHead", color: "cHead" },
                { label: "Descripciones", size: "fsDesc", color: "cDesc" },
              ] as const).map((row) => (
                <tr key={row.label} className="border-t border-black/5">
                  <td className="py-1.5 font-medium">{row.label}</td>
                  <td className="py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" aria-label={`Reducir ${row.label}`} onClick={() => upd({ [row.size]: clampSize((s[row.size] as number) - 0.1) } as Partial<Style>)} className="rounded-full p-1 ring-1 ring-black/10 hover:bg-black/5"><Minus size={12} /></button>
                      <span className="w-10 text-center tabular-nums">{pct(s[row.size] as number)}</span>
                      <button type="button" aria-label={`Aumentar ${row.label}`} onClick={() => upd({ [row.size]: clampSize((s[row.size] as number) + 0.1) } as Partial<Style>)} className="rounded-full p-1 ring-1 ring-black/10 hover:bg-black/5"><Plus size={12} /></button>
                    </div>
                  </td>
                  <td className="py-1.5">
                    <div className="flex justify-center">
                      <input
                        type="color"
                        value={s[row.color] as string}
                        onChange={(e) => upd({ [row.color]: e.target.value } as Partial<Style>)}
                        aria-label={`Color ${row.label}`}
                        className="h-7 w-10 cursor-pointer rounded border border-black/10 bg-white p-0.5"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-[#6b7286]">Los cambios son solo para esta impresión (no afectan la app). Se recuerdan en este navegador.</p>
        </div>
      ) : null}
    </div>
  );
}
