"use client";

import { useTransition } from "react";
import { setStatus } from "@/lib/actions/tasks";
import type { StatusPct } from "@/lib/tasks/types";
import { cn } from "@/lib/cn";

const OPTS: StatusPct[] = [0, 50, 100];

export function StatusToggle({ taskId, date, status }: { taskId: string; date: string; status: StatusPct }) {
  const [pending, start] = useTransition();
  return (
    <div className={cn("flex items-center gap-1", pending && "opacity-50")}>
      {OPTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => start(() => { void setStatus(taskId, date, p); })}
          className={cn(
            "h-7 rounded-full px-2.5 text-[11px] font-medium transition",
            status === p ? "bg-accent text-accent-fg" : "glass text-muted hover:text-fg",
          )}
        >
          {p}%
        </button>
      ))}
    </div>
  );
}
