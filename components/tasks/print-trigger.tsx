"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/** Dispara el diálogo de impresión del navegador al abrir la vista (el usuario llegó por "Imprimir
 *  cronograma") y deja un botón flotante para reimprimir. `.no-print` lo oculta en el papel/PDF. */
export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 500); // margen para cargar logos + fuentes
    return () => clearTimeout(t);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-[#6d6cf0] px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
    >
      <Printer size={16} /> Imprimir
    </button>
  );
}
