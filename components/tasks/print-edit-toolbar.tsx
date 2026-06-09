"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Printer, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Download } from "lucide-react";

/**
 * Barra de edición del IMPRINT (solo vista de impresión, no-print en el papel). Permite agrandar/reducir
 * el tamaño (fuentes + bloques) antes de imprimir, vía el parámetro ?scale (el server re-renderiza). Para
 * el cronograma de plantilla muestra además la navegación de semana (prevHref/nextHref del server).
 */
export function PrintEditToolbar({
  prevHref,
  nextHref,
  weekLabel,
}: {
  prevHref?: string;
  nextHref?: string;
  weekLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const scale = Math.round((Number(sp.get("scale")) || 1) * 100) / 100;
  const [busy, setBusy] = useState(false);

  // Descargar el cronograma como PNG de alta resolución (pixelRatio 3 → ~3168px de ancho).
  async function downloadImage() {
    const node = document.querySelector<HTMLElement>(".rc-page");
    if (!node) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        style: { boxShadow: "none", margin: "0" },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "cronograma-semanal.png";
      a.click();
    } catch {
      /* noop: si falla la captura, el usuario puede usar Imprimir → Guardar como PDF */
    } finally {
      setBusy(false);
    }
  }

  const setScale = (v: number | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v == null || v === 1) p.delete("scale");
    else p.set("scale", String(v));
    router.replace(`${pathname}?${p.toString()}`);
  };
  const clamp = (v: number) => Math.min(1.6, Math.max(0.8, Math.round(v * 100) / 100));

  return (
    <div className="no-print fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white px-2 py-1.5 shadow-lg ring-1 ring-black/10">
      {prevHref && nextHref ? (
        <>
          <Link href={prevHref} aria-label="Semana anterior" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
            <ChevronLeft size={16} />
          </Link>
          <span className="px-1.5 text-xs font-medium text-[#1b1f2e]">{weekLabel}</span>
          <Link href={nextHref} aria-label="Semana siguiente" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
            <ChevronRight size={16} />
          </Link>
          <span className="mx-1 h-4 w-px bg-black/10" />
        </>
      ) : null}

      <button type="button" onClick={() => setScale(clamp(scale - 0.1))} aria-label="Reducir tamaño" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
        <Minus size={15} />
      </button>
      <span className="w-10 text-center text-xs font-semibold text-[#1b1f2e]" title="Tamaño del texto">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={() => setScale(clamp(scale + 0.1))} aria-label="Aumentar tamaño" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
        <Plus size={15} />
      </button>
      <button type="button" onClick={() => setScale(null)} aria-label="Restablecer tamaño" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
        <RotateCcw size={14} />
      </button>

      <span className="mx-1 h-4 w-px bg-black/10" />
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
  );
}
