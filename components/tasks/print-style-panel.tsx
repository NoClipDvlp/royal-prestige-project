"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Printer, ChevronLeft, ChevronRight, Download, RotateCcw, Type, Minus, Plus, GripVertical, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Panel de edición de la vista de IMPRESIÓN (no-print). Edita EN VIVO la tipografía del cronograma vía
 * variables CSS sobre `.rc-print` (sin recargar). La BARRA es arrastrable (grip) y conmutable a vertical
 * para no tapar el cronograma; su posición/orientación y los estilos se recuerdan en localStorage.
 */

const FONTS: { label: string; value: string }[] = [
  { label: "Sistema", value: "" },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  { label: "Redondeada", value: '"SF Pro Rounded", "Segoe UI", system-ui, sans-serif' },
  { label: "Grotesk", value: '"Helvetica Neue", Arial, sans-serif' },
  { label: "Mono", value: "ui-monospace, Menlo, Consolas, monospace" },
];

type Style = { ff: string; fsTitle: number; fsHead: number; fsDesc: number; cTitle: string; cHead: string; cDesc: string };
const DEFAULTS: Style = { ff: "", fsTitle: 1, fsHead: 1, fsDesc: 1, cTitle: "#1b1f2e", cHead: "#1b1f2e", cDesc: "#1b1f2e" };
const STYLE_KEY = "rc-print-style";
const BAR_KEY = "rc-print-bar";

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
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // null = arriba-centro (default)
  const [vertical, setVertical] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // cargar estilos + posición/orientación
  useEffect(() => {
    try {
      const rs = localStorage.getItem(STYLE_KEY);
      if (rs) setS({ ...DEFAULTS, ...JSON.parse(rs) });
      const rb = localStorage.getItem(BAR_KEY);
      if (rb) {
        const b = JSON.parse(rb);
        if (typeof b.vertical === "boolean") setVertical(b.vertical);
        if (b.pos && typeof b.pos.x === "number") setPos(b.pos);
      }
    } catch {
      /* noop */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    applyStyle(s);
    if (loaded.current) {
      try { localStorage.setItem(STYLE_KEY, JSON.stringify(s)); } catch { /* noop */ }
    }
  }, [s]);

  useEffect(() => {
    if (loaded.current) {
      try { localStorage.setItem(BAR_KEY, JSON.stringify({ pos, vertical })); } catch { /* noop */ }
    }
  }, [pos, vertical]);

  // drag
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const st = dragStart.current;
      if (!st) return;
      const el = ref.current;
      const w = el?.offsetWidth ?? 200;
      const h = el?.offsetHeight ?? 48;
      const x = Math.min(Math.max(4, st.x + (e.clientX - st.px)), window.innerWidth - w - 4);
      const y = Math.min(Math.max(4, st.y + (e.clientY - st.py)), window.innerHeight - h - 4);
      setPos({ x, y });
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  function startDrag(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragStart.current = { px: e.clientX, py: e.clientY, x: pos?.x ?? rect.left, y: pos?.y ?? rect.top };
    setDragging(true);
  }

  const upd = (patch: Partial<Style>) => setS((prev) => ({ ...prev, ...patch }));
  const clampSize = (v: number) => Math.min(1.8, Math.max(0.7, Math.round(v * 10) / 10));
  const pct = (v: number) => `${Math.round(v * 100)}%`;

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
      /* queda Imprimir → Guardar como PDF */
    } finally {
      setBusy(false);
    }
  }

  const containerStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: "50%", top: 12, transform: "translateX(-50%)" };

  const iconBtn = "rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5";

  return (
    <div ref={ref} className="no-print fixed z-50 flex flex-col" style={{ ...containerStyle, width: vertical ? "auto" : "min(94vw, 580px)" }}>
      <div className={cn("flex gap-1 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-black/10", vertical ? "flex-col items-stretch" : "items-center")}>
        {/* grip para mover */}
        <button
          type="button"
          onPointerDown={startDrag}
          aria-label="Mover barra"
          title="Arrastra para mover"
          className={cn("touch-none text-[#9aa0ad] hover:bg-black/5", dragging ? "cursor-grabbing" : "cursor-grab", vertical ? "rounded-full py-1.5" : "rounded-full px-1.5 py-1.5")}
        >
          <GripVertical size={16} className="mx-auto" />
        </button>
        {/* orientación */}
        <button type="button" onClick={() => setVertical((v) => !v)} aria-label="Cambiar orientación" title={vertical ? "Horizontal" : "Vertical"} className={iconBtn}>
          <RotateCw size={15} className="mx-auto" />
        </button>

        {prevHref && nextHref ? (
          <div className={cn("flex items-center", vertical && "flex-col gap-0.5")}>
            <Link href={prevHref} aria-label="Semana anterior" className={iconBtn}><ChevronLeft size={16} className="mx-auto" /></Link>
            <span className="px-1 text-center text-[11px] font-medium text-[#1b1f2e]">{weekLabel}</span>
            <Link href={nextHref} aria-label="Semana siguiente" className={iconBtn}><ChevronRight size={16} className="mx-auto" /></Link>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn("inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-black/10", open ? "bg-[#6d6cf0] text-white ring-transparent" : "text-[#1b1f2e] hover:bg-black/5")}
        >
          <Type size={14} /> Personalizar
        </button>
        <button type="button" onClick={downloadImage} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#1b1f2e] ring-1 ring-black/10 hover:bg-black/5 disabled:opacity-50">
          <Download size={14} /> {busy ? "Generando…" : "Imagen"}
        </button>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#6d6cf0] px-3 py-1.5 text-xs font-semibold text-white">
          <Printer size={14} /> Imprimir
        </button>
      </div>

      {open ? (
        <div className="mt-2 w-[min(94vw,340px)] rounded-2xl bg-white p-3 text-[#1b1f2e] shadow-xl ring-1 ring-black/10">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7286]">Tipografía</span>
            <select value={s.ff} onChange={(e) => upd({ ff: e.target.value })} className="ml-auto rounded-lg border border-black/10 px-2 py-1 text-xs" aria-label="Familia tipográfica">
              {FONTS.map((f) => (<option key={f.label} value={f.value}>{f.label}</option>))}
            </select>
            <button type="button" onClick={() => setS(DEFAULTS)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[#6b7286] ring-1 ring-black/10 hover:bg-black/5">
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
                      <input type="color" value={s[row.color] as string} onChange={(e) => upd({ [row.color]: e.target.value } as Partial<Style>)} aria-label={`Color ${row.label}`} className="h-7 w-10 cursor-pointer rounded border border-black/10 bg-white p-0.5" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-[#6b7286]">Solo para esta impresión (no afecta la app). Se recuerda en este navegador.</p>
        </div>
      ) : null}
    </div>
  );
}
