// Presentación (server component) del cronograma semanal para impresión — matriz HORA×día.
// Print-friendly: fondo blanco, texto oscuro, color solo como acento. @page landscape + @media print.
// El thead (Hora + días) se repite en cada página impresa (display:table-header-group) y las filas no
// se parten (break-inside:avoid). ADR de impresión (no-core).

import { taskEmoji, type WeekMatrix } from "@/lib/tasks/print";
import type { DayItem } from "@/lib/tasks/types";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const PRIO_CLASS: Record<string, string> = { high: "hi", medium: "me", low: "lo" };

const PRINT_CSS = `
  *{box-sizing:border-box}
  body{background:#e9edf3}
  .rc-print{--fg:#1b1f2e;--muted:#6b7286;--line:#e3e7f0;--accent:#6d6cf0;--hi:#d1453b;--me:#d98a2b;--lo:#9aa0ad;--ok:#2f9e6f;
    color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .rc-page{width:1056px;max-width:100%;min-height:780px;background:#fff;color:var(--fg);margin:18px auto;padding:30px 34px 20px;
    display:flex;flex-direction:column;box-shadow:0 10px 30px -12px rgba(28,35,71,.35)}
  .rc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:2px solid var(--fg)}
  .rc-head .logo-dist{height:50px;width:auto;object-fit:contain}
  .rc-head .logo-royal{height:44px;width:auto;object-fit:contain}
  .rc-head .title{text-align:center;flex:1}
  .rc-head h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.3px}
  .rc-head .range{margin:3px 0 0;font-size:12.5px;color:var(--muted);font-weight:500}
  table.rc-grid{width:100%;border-collapse:collapse;margin-top:12px;table-layout:fixed;flex:1}
  .rc-grid thead{display:table-header-group}
  .rc-grid th{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:5px 5px 7px;border-bottom:2px solid var(--fg);text-align:left;vertical-align:bottom}
  .rc-grid th .dnum{display:block;font-size:14px;font-weight:800;color:var(--fg);margin-top:1px}
  .rc-grid th.h-hora{width:56px;text-align:right;color:var(--muted)}
  .rc-grid th.we .dow{color:var(--accent)}
  .rc-grid tbody tr{break-inside:avoid;page-break-inside:avoid}
  .rc-grid td{border-bottom:1px solid var(--line);vertical-align:top}
  .rc-grid td.hora{text-align:right;font-size:11px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;border-right:1px solid var(--line);padding:7px 8px 7px 4px;white-space:nowrap}
  .rc-grid td.cell{padding:3px;width:calc((100% - 56px)/7)}
  .rc-grid td.cell.we{background:#fafbfe}
  .t{display:flex;gap:4px;align-items:flex-start;border:1px solid var(--line);border-left-width:3px;padding:3px 5px;border-radius:5px;background:#fff}
  .t + .t{margin-top:3px}
  .t.hi{border-left-color:var(--hi)} .t.me{border-left-color:var(--me)} .t.lo{border-left-color:var(--lo)}
  .t .em{font-size:11px;line-height:1.25}
  .t .meta{min-width:0;flex:1}
  .t .tm{font-size:8.5px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums}
  .t .tt{font-size:10px;line-height:1.18;color:var(--fg)}
  .t.hi .tt{font-weight:700}
  .t .ok{color:var(--ok);font-weight:800;font-size:11px;line-height:1}
  .t.done .tt{color:var(--muted)}
  tr.brk td{border:0;padding:2px 0}
  tr.brk .hora{color:#c2c7d2;font-weight:700;border-right:1px solid var(--line);padding-right:8px;text-align:right}
  tr.brk .ln{border-top:1px dashed #d3d9e3}
  tr.sinhora td{border-top:2px solid var(--line)}
  tr.sinhora td.hora{color:var(--fg)}
  .rc-foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}
  .rc-foot .legend{display:flex;gap:13px;align-items:center;flex-wrap:wrap}
  .rc-foot .legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  .rc-foot .okk{color:var(--ok);font-weight:800}
  .rc-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#aab0bd;font-size:15px;font-style:italic}
  .rc-note{margin:8px 0 0;font-size:10.5px;color:var(--muted)}
  .rc-note b{color:var(--fg);font-weight:700}
  @page{size:letter landscape;margin:12mm}
  @media print{
    body{background:#fff}
    .no-print{display:none !important}
    .rc-page{box-shadow:none;margin:0;width:auto;min-height:0;padding:0}
  }
`;

/** Hora fin = inicio + duración (HH:MM). */
function endTime(start: string, dur: number): string {
  const [h, m] = start.slice(0, 5).split(":").map(Number);
  const tot = h * 60 + m + dur;
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
}

function Cell({ items, weekend }: { items: DayItem[]; weekend: boolean }) {
  return (
    <td className={weekend ? "cell we" : "cell"}>
      {items.map((it) => {
        const start = it.timeSlot ? it.timeSlot.slice(0, 5) : null;
        // hora inicio – hora fin (si hay duración); altura ∝ duración → un bloque de 2h ocupa el doble.
        const label = start ? (it.durationMinutes ? `${start} – ${endTime(start, it.durationMinutes)}` : start) : null;
        const blockH = it.durationMinutes ? Math.max(30, (it.durationMinutes / 60) * 30) : undefined;
        return (
          <div
            key={it.taskId}
            className={`t ${PRIO_CLASS[it.priority] ?? "me"}${it.status === 100 ? " done" : ""}`}
            style={blockH ? { minHeight: `${blockH}px` } : undefined}
          >
            <span className="em">{taskEmoji(it.title)}</span>
            <div className="meta">
              {label ? <div className="tm">{label}</div> : null}
              <div className="tt">{it.title}</div>
            </div>
            {it.status === 100 ? <span className="ok">✓</span> : null}
          </div>
        );
      })}
    </td>
  );
}

export function PrintSchedule({
  matrix,
  dayNumbers,
  title,
  rangeLabel,
  printedLabel,
  footnote,
}: {
  matrix: WeekMatrix;
  dayNumbers: number[]; // 7 (lun…dom)
  title: string; // "Cronograma semanal"
  rangeLabel: string; // "Semana del 8 al 14 de junio de 2026 · María González · Distribución Suaterna"
  printedLabel: string; // "Impreso el 9 de junio de 2026 · Royal Control · Pistacore"
  footnote?: string | null; // p.ej. ítems "sin día asignado" del cronograma de plantilla
}) {
  return (
    <div className="rc-print">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="rc-page">
        <header className="rc-head">
          {/* logos servidos desde /public */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-dist" src="/logo-home-suaterna.png" alt="Distribución" />
          <div className="title">
            <h1>{title}</h1>
            <p className="range">{rangeLabel}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-royal" src="/royal-prestige-logo.png" alt="Royal Prestige" />
        </header>

        {matrix.hasAny ? (
          <table className="rc-grid">
            <colgroup>
              <col style={{ width: "56px" }} />
              <col span={7} />
            </colgroup>
            <thead>
              <tr>
                <th className="h-hora">Hora</th>
                {DOW.map((d, i) => (
                  <th key={d} className={i >= 5 ? "we" : undefined}>
                    <span className="dow">{d}</span>
                    <span className="dnum">{dayNumbers[i]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <RowGroup key={row.hour} label={row.label} cells={row.cells} gapBefore={row.gapBefore} />
              ))}
              {matrix.sinHora ? (
                <tr className="sinhora">
                  <td className="hora">Sin&nbsp;hora</td>
                  {matrix.sinHora.map((items, i) => (
                    <Cell key={i} items={items} weekend={i >= 5} />
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <div className="rc-empty">Sin tareas esta semana</div>
        )}

        {footnote ? <p className="rc-note"><b>Sin día asignado:</b> {footnote}</p> : null}

        <footer className="rc-foot">
          <div className="legend">
            <span><i style={{ background: "#d1453b" }} />Alta</span>
            <span><i style={{ background: "#d98a2b" }} />Media</span>
            <span><i style={{ background: "#9aa0ad" }} />Baja</span>
            <span><span className="okk">✓</span> Completada</span>
            <span style={{ color: "#c2c7d2" }}>⋯ salto de horas sin tareas</span>
          </div>
          <div>{printedLabel}</div>
        </footer>
      </div>
    </div>
  );
}

function RowGroup({ label, cells, gapBefore }: { label: string; cells: DayItem[][]; gapBefore: boolean }) {
  return (
    <>
      {gapBefore ? (
        <tr className="brk">
          <td className="hora">⋯</td>
          <td className="ln" colSpan={7} />
        </tr>
      ) : null}
      <tr>
        <td className="hora">{label}</td>
        {cells.map((items, i) => (
          <Cell key={i} items={items} weekend={i >= 5} />
        ))}
      </tr>
    </>
  );
}
