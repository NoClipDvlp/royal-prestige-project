"use client";

import { useEffect, useRef, useState } from "react";
import { Sticker, X } from "lucide-react";

/** Selector de icono (emoji) para ítems de plantilla. Vacío = icono neutro (no carita); al hacer click
 *  abre una caja de iconos curados — no es un campo de texto. */
const ICONS = [
  "🍳", "🤝", "📞", "📦", "💰", "🎯", "📋",
  "⭐", "📁", "🛍️", "💡", "📮", "🎓", "📅",
  "✅", "🔔", "🏠", "🚗", "☕", "🍽️", "🧾",
  "🎁", "👤", "👥", "📈", "💬", "🕐", "🔑",
];

export function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Elegir icono"
        title="Icono (para el cronograma impreso)"
        className="flex h-9 w-12 items-center justify-center rounded-xl border border-white/60 bg-white/50 text-lg dark:border-white/10 dark:bg-white/5"
      >
        {value ? <span>{value}</span> : <Sticker size={16} className="text-muted" />}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-[15.5rem] rounded-xl border border-black/10 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#161a24]">
          <div className="grid grid-cols-7 gap-1">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => {
                  onChange(ic);
                  setOpen(false);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-base hover:bg-black/5 dark:hover:bg-white/10 ${value === ic ? "ring-2 ring-accent" : ""}`}
              >
                {ic}
              </button>
            ))}
          </div>
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X size={12} /> Quitar icono
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
