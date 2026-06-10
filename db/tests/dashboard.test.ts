// Test (Node, type-stripping) de los helpers PUROS del dashboard del auditor (ADR-0033):
// teamDistribution (percentiles adaptados a N), computeMovers (delta), buildDashboardInsights (umbrales).
// Ejecuta: node --import ./db/tests/ts-register.mjs ./db/tests/dashboard.test.ts
import assert from "node:assert/strict";
import { teamDistribution, computeMovers, buildDashboardInsights } from "@/lib/bi/dashboard";

let n = 0;
const ok = (cond: boolean, msg: string) => { assert.ok(cond, msg); n += 1; };
const rank = (name: string, pct: number | null) => ({ grain: "user" as const, id: name, name, total: 10, done: 0, half: 0, undone: 0, pct });
const sp = (pct: number | null) => ({ bucketStart: "x", total: 0, done: 0, half: 0, undone: 0, pct });

// teamDistribution con N chico (<5) → min-mediana-max + outlier bajo
const dSmall = teamDistribution([rank("A", 90), rank("B", 80), rank("C", 30)]);
ok(dSmall.basis === "min-mediana-max", "N<5 → min-mediana-max");
ok(dSmall.median === 80, `mediana=80 (fue ${dSmall.median})`);
ok(dSmall.lo === 30 && dSmall.hi === 90, "min=30, max=90");
ok(dSmall.outliersLow.some((o) => o.name === "C"), "C (30) outlier bajo vs mediana 80");

// teamDistribution con N>=5 → cuartiles + IQR outlier
const dBig = teamDistribution([rank("A", 90), rank("B", 85), rank("C", 80), rank("D", 75), rank("E", 10)]);
ok(dBig.basis === "cuartiles", "N>=5 → cuartiles");
ok(dBig.outliersLow.some((o) => o.name === "E"), "E (10) outlier por IQR");
ok(dBig.n === 5, "base N=5 declarada");

// pct null se excluye de la base (sin falsa precisión)
const dNull = teamDistribution([rank("A", 80), rank("B", null), rank("C", 60)]);
ok(dNull.n === 2, "pct null excluido de la base");

// computeMovers: delta semana vs previa, caídas primero
const movers = computeMovers(
  { u1: [sp(50), sp(70)], u2: [sp(80), sp(60)], u3: [sp(40)] },
  new Map([["u1", "Uno"], ["u2", "Dos"], ["u3", "Tres"]]),
);
ok(movers.length === 2, "u3 (1 punto) no entra; u1/u2 sí");
ok(movers[0].id === "u2" && movers[0].delta === -20, "caída de u2 (-20) primero");
ok(movers[1].id === "u1" && movers[1].delta === 20, "subida de u1 (+20) después");

// insights: outlier bajo → warn citando el número; caída fuerte → warn; estable → info
const heat = { categories: [], rows: [], truncated: 0 };
const insWarn = buildDashboardInsights(dSmall, movers, heat);
ok(insWarn.some((i) => i.tone === "warn" && i.text.includes("30%")), "insight de outlier cita el número");
ok(insWarn.some((i) => i.tone === "warn" && /cayó 20 pts/.test(i.text)), "insight de caída (u2 -20)");

const insStable = buildDashboardInsights(
  teamDistribution([rank("A", 80), rank("B", 78), rank("C", 82)]),
  [],
  heat,
);
ok(insStable.length === 1 && insStable[0].tone === "info", "equipo estable → único insight info");

console.log(`dashboard OK (${n} casos)`);
