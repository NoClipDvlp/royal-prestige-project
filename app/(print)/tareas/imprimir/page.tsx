// Vista de IMPRESIÓN del cronograma del usuario (ADR print, no-core). Grupo (print) → sin shell de app.
// Imprime el PROPIO usuario (RLS self) su SEMANA o un DÍA (?view=day). Hybrid: días ≤ hoy = instancias reales
// (con ✓), futuros = proyección (tasks_due_on). El navegador da papel/escala/márgenes + "Guardar como PDF".

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, getProfile } from "@/lib/auth/server";
import { bogotaToday, weekStartMonday } from "@/lib/dashboard/week";
import { addDays, isValidIsoDate } from "@/lib/tasks/dates";
import { loadDayForPrint } from "@/lib/tasks/load";
import { DOW, dayNum, isoDow, longDay, printedLabel, weekRange } from "@/lib/tasks/print-format";
import { PrintSchedule, type PrintColumn } from "@/components/tasks/print-schedule";
import { PrintStylePanel } from "@/components/tasks/print-style-panel";
import type { DayItem } from "@/lib/tasks/types";

export default async function ImprimirPage({ searchParams }: { searchParams: Promise<{ d?: string; view?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  if (!profile.role) redirect("/sin-rol");

  const sp = await searchParams;
  const view = sp?.view === "day" ? "day" : "week";
  const today = bogotaToday();
  const base = isValidIsoDate(sp?.d) ? sp.d : today;

  const supabase = await createSupabaseServerClient();
  const { data: me } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  let distName: string | null = null;
  if (profile.distributionId) {
    const { data: dist } = await supabase.from("distributions").select("name").eq("id", profile.distributionId).maybeSingle();
    distName = (dist?.name as string | undefined) ?? null;
  }
  const fullName = (me?.full_name as string | undefined) ?? user.email ?? "";
  const printed = printedLabel(today);

  let days: DayItem[][];
  let columns: PrintColumn[];
  let title: string;
  let rangeLabel: string;

  if (view === "day") {
    const wd = isoDow(base);
    days = [await loadDayForPrint(supabase, base, today)];
    columns = [{ dow: DOW[wd], dnum: dayNum(base), weekend: wd >= 5 }];
    title = "Cronograma del día";
    rangeLabel = [longDay(base), fullName, distName].filter(Boolean).join(" · ");
  } else {
    const weekStart = weekStartMonday(base);
    const weekEnd = addDays(weekStart, 6);
    days = await Promise.all(Array.from({ length: 7 }, (_, i) => loadDayForPrint(supabase, addDays(weekStart, i), today)));
    columns = Array.from({ length: 7 }, (_, i) => ({ dow: DOW[i], dnum: dayNum(addDays(weekStart, i)), weekend: i >= 5 }));
    title = "Cronograma semanal";
    rangeLabel = [weekRange(weekStart, weekEnd), fullName, distName].filter(Boolean).join(" · ");
  }

  const dq = `d=${base}`;
  const viewHrefs = { weekHref: `/tareas/imprimir?${dq}`, dayHref: `/tareas/imprimir?${dq}&view=day`, current: view as "week" | "day" };

  return (
    <>
      <PrintSchedule days={days} columns={columns} title={title} rangeLabel={rangeLabel} printedLabel={printed} />
      <PrintStylePanel viewHrefs={viewHrefs} />
    </>
  );
}
