// Presentación (server component) del cronograma semanal para impresión — TIMELINE tipo Google Calendar.
// Bloques posicionados por hora de inicio y con ALTO ∝ duración (un 2h ocupa el doble que un 1h), en 7
// columnas (lun–dom), con carriles para solapes. Recorta la ventana horaria al rango usado (sin espacio
// muerto). Cada bloque deja una CAJA en blanco para que el usuario dibuje el emoji a mano. Print-friendly:
// fondo blanco, texto oscuro, color solo como acento. @page landscape.

import { layoutDay, weekWindow, type PrintBlock } from "@/lib/tasks/print";
import type { DayItem } from "@/lib/tasks/types";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const PRIO_CLASS: Record<string, string> = { high: "hi", medium: "me", low: "lo" };
const GUTTER = 46; // ancho del carril de horas (px)
const USABLE = 600; // alto objetivo del timeline (px) para llenar una página landscape
const MIN_BLOCK = 30; // alto mínimo legible de un bloque (px)

const PRINT_CSS = `
  *{box-sizing:border-box}
  body{background:#e9edf3}
  .rc-print{--fg:#1b1f2e;--muted:#6b7286;--line:#e3e7f0;--accent:#6d6cf0;--hi:#d1453b;--me:#d98a2b;--lo:#9aa0ad;--ok:#2f9e6f;
    color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .rc-page{width:1056px;max-width:100%;background:#fff;color:var(--fg);margin:18px auto;padding:30px 34px 20px;
    display:flex;flex-direction:column;box-shadow:0 10px 30px -12px rgba(28,35,71,.35)}
  .rc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:2px solid var(--fg)}
  .rc-head .logo-dist{height:50px;width:auto;object-fit:contain}
  .rc-head .logo-royal{height:44px;width:auto;object-fit:contain}
  .rc-head .title{text-align:center;flex:1}
  .rc-head h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.3px}
  .rc-head .range{margin:3px 0 0;font-size:12.5px;color:var(--muted);font-weight:500}
  /* cabecera de días (alineada con las columnas del timeline) */
  .cal-head{display:flex;margin-top:12px}
  .cal-head .sp{flex:none}
  .cal-head .dh{flex:1;text-align:center;padding:0 2px 5px;border-bottom:2px solid var(--fg)}
  .cal-head .dh .dow{display:block;font-size:9.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)}
  .cal-head .dh .dnum{display:block;font-size:14px;font-weight:800;color:var(--fg)}
  .cal-head .dh.we .dow{color:var(--accent)}
  /* timeline */
  .cal{position:relative;display:flex}
  .cal-gutter{position:relative;flex:none}
  .cal-gutter .hl{position:absolute;right:6px;font-size:9.5px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;transform:translateY(-50%)}
  .cal-grid{position:relative;flex:1;border-top:1px solid var(--line)}
  .cal-grid .hr{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
  .cal-cols{position:absolute;inset:0;display:flex}
  .cal-col{position:relative;flex:1;border-left:1px solid var(--line)}
  .cal-col.we{background:#fafbfe}
  .ev{position:absolute;overflow:hidden;display:flex;gap:3px;border:1px solid var(--line);border-left-width:3px;border-radius:5px;background:#fff;padding:2px 3px}
  .ev.hi{border-left-color:var(--hi)} .ev.me{border-left-color:var(--me)} .ev.lo{border-left-color:var(--lo)}
  .ev .ebox{flex:none;width:15px;height:15px;border:1px dashed #b9c0cc;border-radius:4px}
  .ev .ebody{min-width:0;flex:1}
  .ev .et{font-size:8px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;line-height:1.15;white-space:nowrap}
  .ev .en{font-size:9.5px;line-height:1.15;color:var(--fg)}
  .ev.hi .en{font-weight:700}
  .ev .eok{position:absolute;top:2px;right:3px;color:var(--ok);font-weight:800;font-size:9px;line-height:1}
  .ev.done .en{color:var(--muted)}
  /* sin hora */
  .cal-sin{display:flex;margin-top:8px;border-top:2px solid var(--line);padding-top:5px}
  .cal-sin .lbl{flex:none;font-size:10px;font-weight:700;color:var(--fg);padding-right:8px;text-align:right}
  .cal-sin .scol{flex:1;display:flex;flex-direction:column;gap:3px;padding:0 2px}
  .cal-sin .si{display:flex;gap:3px;align-items:center;border:1px solid var(--line);border-left-width:3px;border-radius:5px;padding:2px 3px}
  .cal-sin .si.hi{border-left-color:var(--hi)} .cal-sin .si.me{border-left-color:var(--me)} .cal-sin .si.lo{border-left-color:var(--lo)}
  .cal-sin .si .ebox{flex:none;width:13px;height:13px;border:1px dashed #b9c0cc;border-radius:4px}
  .cal-sin .si .en{font-size:9px;line-height:1.1;color:var(--fg);min-width:0}
  .rc-empty{padding:60px 0;text-align:center;color:#aab0bd;font-size:15px;font-style:italic}
  .rc-note{margin:8px 0 0;font-size:10.5px;color:var(--muted)}
  .rc-note b{color:var(--fg);font-weight:700}
  .rc-foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}
  .rc-foot .legend{display:flex;gap:13px;align-items:center;flex-wrap:wrap}
  .rc-foot .legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  .rc-foot .legend .box{display:inline-block;width:10px;height:10px;border:1px dashed #b9c0cc;border-radius:3px;margin-right:4px;vertical-align:-1px}
  .rc-foot .okk{color:var(--ok);font-weight:800}
  @page{size:letter landscape;margin:12mm}
  @media print{
    body{background:#fff}
    .no-print{display:none !important}
    .rc-page{box-shadow:none;margin:0;width:auto;padding:0}
  }
`;

const fmt = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function Event({ b, pxPerHour, startMin }: { b: PrintBlock; pxPerHour: number; startMin: number }) {
  const it = b.item;
  const top = ((b.startMin - startMin) / 60) * pxPerHour;
  const height = Math.max(MIN_BLOCK, ((b.endMin - b.startMin) / 60) * pxPerHour);
  const widthPct = 100 / b.lanes;
  const label = b.hasDuration ? `${fmt(b.startMin)} – ${fmt(it.timeSlot ? b.endMin : b.startMin)}` : fmt(b.startMin);
  return (
    <div
      className={`ev ${PRIO_CLASS[it.priority] ?? "me"}${it.status === 100 ? " done" : ""}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${b.lane * widthPct}% + ${b.lane === 0 ? 0 : 2}px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      <span className="ebox" aria-hidden /> {/* espacio en blanco para el emoji a mano */}
      <div className="ebody">
        <div className="et">{label}</div>
        <div className="en">{it.title}</div>
      </div>
      {it.status === 100 ? <span className="eok">✓</span> : null}
    </div>
  );
}

export function PrintSchedule({
  days,
  dayNumbers,
  title,
  rangeLabel,
  printedLabel,
  footnote,
}: {
  days: DayItem[][]; // 7 (lun…dom)
  dayNumbers: number[]; // 7
  title: string;
  rangeLabel: string;
  printedLabel: string;
  footnote?: string | null;
}) {
  const win = weekWindow(days);
  const startHour = win?.startHour ?? 8;
  const endHour = win?.endHour ?? 18;
  const windowHours = Math.max(1, endHour - startHour);
  const pxPerHour = Math.max(40, Math.min(120, USABLE / windowHours));
  const gridH = windowHours * pxPerHour;
  const startMin = startHour * 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const blocksByDay = days.map((d) => layoutDay(d));
  const sinHora = days.map((d) => d.filter((it) => !it.timeSlot));
  const hasSin = sinHora.some((c) => c.length > 0);

  return (
    <div className="rc-print">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="rc-page">
        <header className="rc-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-dist" src="/logo-home-suaterna.png" alt="Distribución" />
          <div className="title">
            <h1>{title}</h1>
            <p className="range">{rangeLabel}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-royal" src="/royal-prestige-logo.png" alt="Royal Prestige" />
        </header>

        {win ? (
          <>
            {/* cabecera de días alineada con las columnas */}
            <div className="cal-head">
              <div className="sp" style={{ width: GUTTER }} />
              {DOW.map((d, i) => (
                <div key={d} className={i >= 5 ? "dh we" : "dh"}>
                  <span className="dow">{d}</span>
                  <span className="dnum">{dayNumbers[i]}</span>
                </div>
              ))}
            </div>

            {/* timeline */}
            <div className="cal" style={{ height: gridH }}>
              <div className="cal-gutter" style={{ width: GUTTER }}>
                {hours.map((h) => (
                  <span key={h} className="hl" style={{ top: (h - startHour) * pxPerHour }}>
                    {String(h).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              <div className="cal-grid">
                {hours.map((h) => (
                  <div key={h} className="hr" style={{ top: (h - startHour) * pxPerHour }} />
                ))}
                <div className="cal-cols">
                  {blocksByDay.map((blocks, i) => (
                    <div key={i} className={i >= 5 ? "cal-col we" : "cal-col"}>
                      {blocks.map((b) => (
                        <Event key={b.item.taskId} b={b} pxPerHour={pxPerHour} startMin={startMin} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* tareas sin hora */}
            {hasSin ? (
              <div className="cal-sin">
                <div className="lbl" style={{ width: GUTTER }}>Sin hora</div>
                {sinHora.map((items, i) => (
                  <div key={i} className="scol">
                    {items.map((it) => (
                      <div key={it.taskId} className={`si ${PRIO_CLASS[it.priority] ?? "me"}`}>
                        <span className="ebox" aria-hidden />
                        <span className="en">{it.title}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </>
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
            <span><span className="box" /> Tu emoji</span>
          </div>
          <div>{printedLabel}</div>
        </footer>
      </div>
    </div>
  );
}
