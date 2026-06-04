"use client";

import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";

/** Shell de tabs del panel admin (ADR-0015 Fase 2b). Agrupa las secciones existentes sin reescribirlas. */
export function AdminTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <>
      <Segmented
        value={active}
        onChange={setActive}
        options={tabs.map((t) => ({ value: t.id, label: t.label }))}
        ariaLabel="Secciones del panel"
      />
      <div className="flex flex-col gap-5">{current?.content}</div>
    </>
  );
}
