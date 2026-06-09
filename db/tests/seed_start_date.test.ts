// Test (Node, type-stripping) de seedStartDate (ADR-0028) — la lógica REAL de lib/tasks/template-seed.ts,
// reusando los helpers reales de fecha (weekStartMonday + addDays). Sin re-implementar nada (anti-drift).
// Ejecuta: node --import ./db/tests/ts-register.mjs ./db/tests/seed_start_date.test.ts
import assert from "node:assert/strict";
import { seedStartDate } from "@/lib/tasks/template-seed";

// Semana de referencia: lun 2026-06-08 … dom 2026-06-14 (isodow 1=lun … 7=dom).
let n = 0;
const eq = (got: string, exp: string, msg: string) => {
  assert.equal(got, exp, `${msg} (esperado ${exp}, obtuve ${got})`);
  n += 1;
};

// once CON weekdays → su día dentro de la semana de today (criterio de éxito: lun/mié/vie distintos, NO today)
eq(seedStartDate("2026-06-08", "once", [1]), "2026-06-08", "once lun, asignado lun → lun");
eq(seedStartDate("2026-06-08", "once", [3]), "2026-06-10", "once mié → mié");
eq(seedStartDate("2026-06-08", "once", [5]), "2026-06-12", "once vie → vie");
eq(seedStartDate("2026-06-08", "once", [7]), "2026-06-14", "once dom → domingo de la semana");

// día YA pasó respecto a today → semana siguiente; día == today → today (no nace vencida)
eq(seedStartDate("2026-06-11", "once", [1]), "2026-06-15", "once lun, hoy jue → lun próximo");
eq(seedStartDate("2026-06-11", "once", [3]), "2026-06-17", "once mié, hoy jue → mié próximo");
eq(seedStartDate("2026-06-11", "once", [4]), "2026-06-11", "once jue == hoy → hoy");
eq(seedStartDate("2026-06-11", "once", [5]), "2026-06-12", "once vie, hoy jue → vie de esta semana");

// once SIN weekdays → today (fallback actual)
eq(seedStartDate("2026-06-09", "once", null), "2026-06-09", "once sin weekdays → hoy");
eq(seedStartDate("2026-06-09", "once", []), "2026-06-09", "once weekdays vacío → hoy");
eq(seedStartDate("2026-06-09", "once", [99]), "2026-06-09", "weekdays corrupto → hoy (defensivo)");

// recurrentes → today (ancla de asignación; weekdays alimenta is_task_due, no el start_date)
eq(seedStartDate("2026-06-09", "weekly", [1, 3, 5]), "2026-06-09", "weekly → hoy");
eq(seedStartDate("2026-06-09", "daily", null), "2026-06-09", "daily → hoy");

console.log(`seed_start_date OK (${n} casos)`);
