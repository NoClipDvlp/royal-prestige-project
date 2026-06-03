"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { adminListUserTasks, type AdminTaskRow } from "@/lib/actions/admin";

/** Vista READ-ONLY de las tareas de un usuario (RLS admin). Se carga al expandir. */
export function UserTasks({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<AdminTaskRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setErr(null);
      start(async () => {
        const r = await adminListUserTasks(userId);
        if (!r.ok) setErr(r.error ?? "Error");
        else {
          setRows(r.tasks ?? []);
          setLoaded(true);
        }
      });
    }
  }

  return (
    <div className="sm:basis-full">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1 text-xs text-muted transition hover:text-fg"
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Ver tareas
      </button>
      {open ? (
        <div className="mt-2 rounded-xl glass p-3">
          {pending ? (
            <p className="text-xs text-muted">Cargando…</p>
          ) : err ? (
            <p className="text-xs text-red-500">{err}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted">Sin tareas materializadas.</p>
          ) : (
            <ul className="space-y-1">
              {rows.map((t) => (
                <li key={`${t.taskId}-${t.date}`} className="flex items-center gap-2 text-xs text-fg">
                  <span className="w-20 shrink-0 text-muted">{t.date}</span>
                  <span className="w-12 shrink-0 text-muted">{t.timeSlot ?? "—"}</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 rounded-full glass px-2 py-0.5 text-[11px] text-muted">{t.status}%</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted/70">Solo lectura. Editar tareas de otros está diferido.</p>
        </div>
      ) : null}
    </div>
  );
}
