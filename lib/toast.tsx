"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// Toast mínimo sin dependencias (pub/sub a nivel de módulo + <Toaster/> montado una vez en el shell).
type Kind = "error" | "info";
type ToastItem = { id: number; message: string; kind: Kind };

let listeners: ((t: ToastItem) => void)[] = [];
let counter = 0;

/** Dispara un toast desde cualquier client component: toast("Guardado") / toast("Error", "error"). */
export function toast(message: string, kind: Kind = "info") {
  const item: ToastItem = { id: (counter += 1), message, kind };
  for (const l of listeners) l(item);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setItems((cur) => [...cur, t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 3000);
    };
    listeners.push(onToast);
    return () => {
      listeners = listeners.filter((l) => l !== onToast);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "glass rounded-2xl px-4 py-2 text-sm shadow-sm",
            t.kind === "error" ? "text-red-500" : "text-fg",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
