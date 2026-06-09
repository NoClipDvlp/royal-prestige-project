// Impresión del CRONOGRAMA DE PLANTILLA (admin) — ADR print, no-core. Grupo (print) → sin shell de app.
// Es una SOLA semana (rango elegido al imprimir), NO recurrencia infinita y NO siembra tareas → cero
// "tareas basura" para los asignados. Coloca los ítems por día: daily = 7 días; weekly = sus weekdays;
// once = su día puntual (weekdays de 1 elemento); sin día → nota "Sin día asignado".

import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/server";
import { bogotaToday, weekStartMonday } from "@/lib/dashboard/week";
import { addDays, isValidIsoDate } from "@/lib/tasks/dates";
import { DOW, dayNum, printedLabel, weekRange } from "@/lib/tasks/print-format";
import { PrintSchedule } from "@/components/tasks/print-schedule";
import { PrintStylePanel } from "@/components/tasks/print-style-panel";
import type { DayItem, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type ItemRow = {
  id: string;
  title: string | null;
  time_slot: string | null;
  duration_minutes: number | null;
  priority: string | null;
  recurrence: string | null;
  weekdays: number[] | null;
  emoji: string | null;
};

/** isodow (1=lun…7=dom) en los que aparece el ítem esa semana; [] = sin día (puntual sin día asignado). */
function isodowsFor(it: ItemRow): number[] {
  const wd = (it.weekdays ?? []).filter((d) => d >= 1 && d <= 7);
  switch (it.recurrence) {
    case "daily":
      return [1, 2, 3, 4, 5, 6, 7];
    case "weekly":
      return wd.length > 0 ? wd : [1, 2, 3, 4, 5, 6, 7]; // weekly sin días = toda la semana (legacy)
    case "once":
    case "monthly":
    default:
      return wd; // su día puntual; vacío → sin día
  }
}

async function loadTemplate(supabase: DB, id: string) {
  const { data: tpl } = await supabase.from("task_templates").select("id, name").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!tpl) return null;
  const { data: items } = await supabase
    .from("template_items")
    .select("id, title, time_slot, duration_minutes, priority, recurrence, weekdays, emoji")
    .eq("template_id", id)
    .order("time_slot", { nullsFirst: false });
  return { name: (tpl.name as string) ?? "Plantilla", items: (items ?? []) as unknown as ItemRow[] };
}

export default async function ImprimirPlantillaPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; from?: string }>;
}) {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/"); // solo admin imprime plantillas

  const sp = await searchParams;
  if (!sp?.id) notFound();

  const supabase = await createSupabaseServerClient();
  const tpl = await loadTemplate(supabase, sp.id);
  if (!tpl) notFound();

  const today = bogotaToday();
  const weekStart = weekStartMonday(isValidIsoDate(sp.from) ? sp.from : today);
  const weekEnd = addDays(weekStart, 6);

  // Colocar ítems por día (7 arreglos lun…dom) + recoger los "sin día".
  const days: DayItem[][] = [[], [], [], [], [], [], []];
  const sinDia: string[] = [];
  for (const it of tpl.items) {
    const dows = isodowsFor(it);
    if (dows.length === 0) {
      sinDia.push(it.title ?? "(sin título)");
      continue;
    }
    for (let i = 0; i < 7; i++) {
      if (!dows.includes(i + 1)) continue;
      days[i].push({
        taskId: `${it.id}-${i}`,
        date: addDays(weekStart, i),
        title: it.title ?? "",
        timeSlot: it.time_slot ?? null,
        durationMinutes: it.duration_minutes ?? null,
        priority: (it.priority ?? "medium") as TaskPriority,
        recurrence: (it.recurrence ?? "once") as TaskRecurrence,
        weekdays: it.weekdays ?? null,
        emoji: it.emoji ?? null, // ADR-0024
        status: 0, // plantilla: sin estado
      });
    }
  }

  const columns = Array.from({ length: 7 }, (_, i) => ({ dow: DOW[i], dnum: dayNum(addDays(weekStart, i)), weekend: i >= 5 }));
  const rangeLabel = `${weekRange(weekStart, weekEnd)} · Plantilla`;
  const printed = printedLabel(today);

  const base = `/plantillas/imprimir?id=${encodeURIComponent(sp.id)}`;
  const prevHref = `${base}&from=${addDays(weekStart, -7)}`;
  const nextHref = `${base}&from=${addDays(weekStart, 7)}`;

  return (
    <>
      <PrintStylePanel prevHref={prevHref} nextHref={nextHref} weekLabel={`${dayNum(weekStart)}–${dayNum(weekEnd)}`} />
      <PrintSchedule
        days={days}
        columns={columns}
        title={tpl.name}
        rangeLabel={rangeLabel}
        printedLabel={printed}
        footnote={sinDia.length ? sinDia.join(" · ") : null}
      />
    </>
  );
}
