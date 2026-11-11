import type { Floor, Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_COLORS } from "../model/defaults";
import { esc, niceScaleBar } from "../export/svg";
import { formatLength } from "../model/units";
import { frameSheet, INK, f2, tableSvg, type Body } from "../studio/frame";
import { buildingBox } from "./compass";
import { shadowPolygons, type SunPos } from "./sun";
import { windAnalysis, type FlowRating } from "./wind";
import { vastuCheck, type VastuRating } from "./vastu";
import { POINT_LABELS, electricalFloor, plumbingFloor, servicesSummary, type PointKind, type ServicesOptions } from "./services";
import { buildTimeline, type TimelineOptions } from "./timeline";

const PAD = 60;
interface View { s: number; X: (m: number) => number; Y: (m: number) => number; w: number; h: number }
function view(p: Project, includePlot: boolean): View {
  const rs = p.floors.flatMap((f) => f.rooms.filter(isValidRect));
  const b = buildingBox(p);
  let x0 = b ? b.x0 : 0, x1 = b ? b.x1 : p.plot.width, y0 = b ? b.y0 : 0, y1 = b ? b.y1 : p.plot.depth;
  if (includePlot || !rs.length) { x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, p.plot.width); y1 = Math.max(y1, p.plot.depth); }
  const s = Math.max(3, Math.min(70, 760 / Math.max(1, x1 - x0), 600 / Math.max(1, y1 - y0)));
  return { s, X: (m) => f2(PAD + (m - x0) * s), Y: (m) => f2(PAD + (m - y0) * s), w: (x1 - x0) * s + PAD * 2, h: (y1 - y0) * s + PAD * 2 + 16 };
}
const northArrow = (p: Project, v: View) => `<g transform="translate(${f2(v.w - 40)} 44) rotate(${p.northAngle ?? 0})"><circle r="20" fill="#fff" stroke="${INK}"/><path d="M0 -15 L6 9 L0 4 L-6 9 Z" fill="${INK}"/><text y="-24" font-size="11" font-weight="bold" text-anchor="middle" fill="${INK}">N</text></g>`;
const walls = (floor: Floor, v: View) => floor.walls.map((w) => `<line x1="${v.X(w.x1)}" y1="${v.Y(w.y1)}" x2="${v.X(w.x2)}" y2="${v.Y(w.y2)}" stroke="${INK}" stroke-width="${f2(Math.max(1.4, w.thickness * v.s))}"/>`).join("");
const plotOutline = (p: Project, v: View) => (p.plot.polygon ? `<polygon points="${p.plot.polygon.map((q) => `${v.X(q.x)},${v.Y(q.y)}`).join(" ")}" fill="#f4f7ee" stroke="#6b7280" stroke-dasharray="6 3"/>` : `<rect x="${v.X(0)}" y="${v.Y(0)}" width="${f2(p.plot.width * v.s)}" height="${f2(p.plot.depth * v.s)}" fill="#f4f7ee" stroke="#6b7280" stroke-dasharray="6 3"/>`);
const scaleBar = (p: Project, v: View) => { const sb = niceScaleBar(Math.max(p.plot.width, p.plot.depth), p.unitSystem); const y = v.h - 14; return `<line x1="${PAD}" y1="${y}" x2="${f2(PAD + sb.meters * v.s)}" y2="${y}" stroke="${INK}" stroke-width="2"/><text x="${f2(PAD + (sb.meters * v.s) / 2)}" y="${y - 4}" font-size="9" text-anchor="middle" fill="${INK}">${esc(sb.label)}</text>`; };

export function shadowSvg(p: Project, sun: SunPos, label: string): string {
  const v = view(p, true);
  const o: string[] = [plotOutline(p, v)];
  for (const poly of shadowPolygons(p, sun)) o.push(`<polygon points="${poly.map((q) => `${v.X(q.x)},${v.Y(q.y)}`).join(" ")}" fill="#1f2937" fill-opacity="0.18"/>`);
  const g = p.floors[0];
  for (const r of g.rooms.filter(isValidRect)) o.push(`<rect x="${v.X(r.x)}" y="${v.Y(r.y)}" width="${f2(r.width * v.s)}" height="${f2(r.depth * v.s)}" fill="${ROOM_COLORS[r.type]}" stroke="none"/>`);
  o.push(walls(g, v), northArrow(p, v), scaleBar(p, v));
  const sunTxt = sun.altitude < 2 ? "Sun is below the horizon: no shadow." : `Sun altitude ${sun.altitude.toFixed(0)}°, azimuth ${sun.azimuth.toFixed(0)}° (from north, clockwise).`;
  o.push(`<text x="${PAD}" y="22" font-size="11" fill="${INK}">${esc(label)} - ${esc(sunTxt)}</text>`);
  return frameSheet(p, "Sun and shadow study", label, { svg: o.join(""), w: v.w, h: v.h }, [], ["Shadows are cast by every room block at its modelled height (including plinth and parapet) onto flat ground. Neighbouring buildings and trees are not modelled. Times are SOLAR time (12:00 = sun due south/north)."]);
}

const FLOW_FILL: Record<FlowRating, string> = { good: "#bbf7d0", fair: "#fef08a", poor: "#fed7aa", none: "#fecaca" };
export function windSvg(p: Project, floor: Floor, windFrom: number): string {
  const v = view(p, false);
  const rows = windAnalysis(p, windFrom).filter((r) => r.floorName === floor.name);
  const o: string[] = [];
  for (const r of floor.rooms.filter(isValidRect)) {
    const row = rows.find((q) => q.roomId === r.id);
    o.push(`<rect x="${v.X(r.x)}" y="${v.Y(r.y)}" width="${f2(r.width * v.s)}" height="${f2(r.depth * v.s)}" fill="${row ? FLOW_FILL[row.rating] : "#eef0f3"}" stroke="none"/>`);
    if (r.width * v.s > 50 && r.depth * v.s > 26) o.push(`<text x="${f2(v.X(r.x + r.width / 2))}" y="${f2(v.Y(r.y + r.depth / 2))}" font-size="9" text-anchor="middle" fill="${INK}">${esc(r.name)}</text>`);
  }
  o.push(walls(floor, v), northArrow(p, v), scaleBar(p, v));
  // wind arrow drawn on the side the wind comes from
  const pa = (((windFrom + (p.northAngle ?? 0)) % 360) * Math.PI) / 180;
  const cx = v.w / 2, cy = (v.h - 16) / 2, R = Math.min(v.w, v.h) / 2 - 14;
  const sx = cx + Math.sin(pa) * R, sy = cy - Math.cos(pa) * R, ex = cx + Math.sin(pa) * (R - 36), ey = cy - Math.cos(pa) * (R - 36);
  o.push(`<defs><marker id="wa" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#2563eb"/></marker></defs><line x1="${f2(sx)}" y1="${f2(sy)}" x2="${f2(ex)}" y2="${f2(ey)}" stroke="#2563eb" stroke-width="3" marker-end="url(#wa)"/><text x="${f2(sx)}" y="${f2(sy - 6)}" font-size="10" fill="#2563eb" text-anchor="middle">Wind</text>`);
  const leg = [["good", "Cross ventilation"], ["fair", "One side only"], ["poor", "Too little opening"], ["none", "No outside opening"]].map(([k, t], i) => `<rect x="0" y="${i * 16}" width="12" height="10" fill="${FLOW_FILL[k as FlowRating]}" stroke="#9ca3af" stroke-width="0.5"/><text x="18" y="${i * 16 + 9}" font-size="9" fill="${INK}">${esc(t)}</text>`).join("");
  return frameSheet(p, `Ventilation - ${floor.name}`, `Wind from ${windFrom.toFixed(0)}° (compass bearing)`, { svg: o.join(""), w: v.w, h: v.h }, [{ svg: leg, w: 150, h: 64 }], ["Rule-based check of opening areas and which walls face the wind. It is not a wind-tunnel or CFD study; real airflow depends on neighbouring buildings, trees and local terrain."]);
}

const VCOL: Record<VastuRating, string> = { favoured: "#bbf7d0", acceptable: "#e0f2fe", neutral: "#f3f4f6", avoid: "#fecaca" };
export function vastuSvg(p: Project, floor: Floor): string {
  const v = view(p, false);
  const res = vastuCheck(p);
  const o: string[] = [];
  for (const r of floor.rooms.filter(isValidRect)) {
    const row = res.rooms.find((q) => q.roomId === r.id);
    o.push(`<rect x="${v.X(r.x)}" y="${v.Y(r.y)}" width="${f2(r.width * v.s)}" height="${f2(r.depth * v.s)}" fill="${row ? VCOL[row.rating] : "#f3f4f6"}" stroke="none"/>`);
    if (r.width * v.s > 50 && r.depth * v.s > 26) o.push(`<text x="${f2(v.X(r.x + r.width / 2))}" y="${f2(v.Y(r.y + r.depth / 2) - 2)}" font-size="9" text-anchor="middle" fill="${INK}">${esc(r.name)}</text>${row ? `<text x="${f2(v.X(r.x + r.width / 2))}" y="${f2(v.Y(r.y + r.depth / 2) + 9)}" font-size="8" text-anchor="middle" fill="#4b5263">${row.sector}</text>` : ""}`);
  }
  o.push(walls(floor, v), northArrow(p, v), scaleBar(p, v));
  return frameSheet(p, `Vastu check - ${floor.name}`, "Traditional guideline view (optional)", { svg: o.join(""), w: v.w, h: v.h }, [], ["Vastu Shastra is a traditional belief system. Directions are measured from the centre of the building using the north angle set in the plan. This is a cultural guide, not an engineering, safety or legal requirement."]);
}

const SYM: Record<PointKind, (x: number, y: number) => string> = {
  light: (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#b45309" stroke-width="1"/><path d="M${x - 3} ${y - 3}L${x + 3} ${y + 3}M${x + 3} ${y - 3}L${x - 3} ${y + 3}" stroke="#b45309" stroke-width="0.8"/>`,
  fan: (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="#7c3aed" stroke-width="1"/><path d="M${x} ${y - 5}L${x} ${y + 5}M${x - 5} ${y}L${x + 5} ${y}" stroke="#7c3aed" stroke-width="1.2"/>`,
  socket: (x, y) => `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="#fff" stroke="#047857" stroke-width="1"/>`,
  power15: (x, y) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="#047857" stroke="#064e3b" stroke-width="1"/>`,
  switch: (x, y) => `<rect x="${x - 3}" y="${y - 5}" width="6" height="10" fill="#fff" stroke="#111827" stroke-width="1"/><text x="${x}" y="${y + 3}" font-size="7" text-anchor="middle" fill="#111827">S</text>`,
  ac: (x, y) => `<rect x="${x - 7}" y="${y - 3}" width="14" height="6" fill="#e0f2fe" stroke="#0369a1" stroke-width="1"/>`,
  exhaust: (x, y) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#fff" stroke="#6b7280" stroke-width="1" stroke-dasharray="2 1"/>`,
  geyser: (x, y) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="4" fill="#fecaca" stroke="#b91c1c" stroke-width="1"/>`,
};
export type ServicesLayer = "electrical" | "plumbing" | "both";
export function servicesSvg(p: Project, floor: Floor, layer: ServicesLayer, opts: ServicesOptions): string {
  const v = view(p, false);
  const o: string[] = [];
  for (const r of floor.rooms.filter(isValidRect)) o.push(`<rect x="${v.X(r.x)}" y="${v.Y(r.y)}" width="${f2(r.width * v.s)}" height="${f2(r.depth * v.s)}" fill="#f6f7f9" stroke="none"/>`);
  o.push(walls(floor, v));
  for (const r of floor.rooms.filter(isValidRect)) if (r.width * v.s > 50 && r.depth * v.s > 26) o.push(`<text x="${v.X(r.x) + 4}" y="${v.Y(r.y) + 11}" font-size="8" fill="#9aa3b2">${esc(r.name)}</text>`);
  if (layer !== "plumbing") for (const e of electricalFloor(floor, opts)) o.push(SYM[e.kind](v.X(e.x), v.Y(e.y)));
  if (layer !== "electrical") {
    const pl = plumbingFloor(floor);
    for (const r of pl.runs) o.push(`<line x1="${v.X(r.x1)}" y1="${v.Y(r.y1)}" x2="${v.X(r.x2)}" y2="${v.Y(r.y2)}" stroke="${r.kind === "supply" ? "#2563eb" : "#92400e"}" stroke-width="1.6" ${r.kind === "drain" ? 'stroke-dasharray="5 3"' : ""}/>`);
    if (pl.stack) o.push(`<circle cx="${v.X(pl.stack.x)}" cy="${v.Y(pl.stack.y)}" r="6" fill="#fff" stroke="#111827" stroke-width="1.5"/><text x="${v.X(pl.stack.x) + 9}" y="${v.Y(pl.stack.y) + 3}" font-size="8" fill="#111827">Stack</text>`);
    for (const fx of pl.fixtures) o.push(`<ellipse cx="${v.X(fx.x)}" cy="${v.Y(fx.y)}" rx="6" ry="5" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1"/><text x="${v.X(fx.x)}" y="${v.Y(fx.y) + 2.6}" font-size="6.5" text-anchor="middle" fill="#1e3a8a">${fx.kind === "wc" ? "WC" : fx.kind === "basin" ? "WB" : fx.kind === "shower" ? "SH" : fx.kind === "sink" ? "SK" : "WM"}</text>`);
  }
  o.push(northArrow(p, v), scaleBar(p, v));
  const sum = servicesSummary(p, opts);
  const elec = (Object.keys(POINT_LABELS) as PointKind[]).filter((k) => sum.points[k] > 0).map((k) => [POINT_LABELS[k], String(sum.points[k])]);
  const t1 = tableSvg("Electrical points (all floors)", ["Item", "Qty"], [...elec, ["Connected load (kW)", String(sum.connectedKw)]], [200, 60]);
  const t2 = tableSvg("Plumbing (all floors)", ["Item", "Qty"], [["WC", String(sum.fixtures.wc)], ["Wash basin", String(sum.fixtures.basin)], ["Shower", String(sum.fixtures.shower)], ["Kitchen sink", String(sum.fixtures.sink)], ["Washing machine", String(sum.fixtures.washer)], ["Supply pipe (m, approx)", String(sum.supplyPipeM)], ["Drain pipe (m, approx)", String(sum.drainPipeM)], [`Water use, ${sum.people} people (L/day)`, String(sum.dailyLitres)], ["Suggested tank (L)", String(sum.tankLitres)]], [200, 60]);
  return frameSheet(p, `Electrical & plumbing - ${floor.name}`, "PRELIMINARY layout", { svg: o.join(""), w: v.w, h: v.h }, [t1, t2], ["PRELIMINARY point and pipe layout generated by rules to size quantities. Circuit design, cable and pipe sizes, earthing, protection devices and slopes must be designed and approved by a licensed electrician/plumber or engineer. Pipe lengths are straight-run estimates."]);
}

export function timelineSvg(p: Project, o: TimelineOptions): string {
  const t = buildTimeline(p, o);
  const rowH = 22, labelW = 250, chartW = 620;
  const scale = chartW / Math.max(1, t.totalWorkDays);
  const rows = t.phases.map((ph, i) => `<text x="0" y="${i * rowH + 14}" font-size="10" fill="${INK}">${esc(ph.name.slice(0, 44))}</text><rect x="${f2(labelW + ph.start * scale)}" y="${i * rowH + 3}" width="${f2(Math.max(2, ph.days * scale))}" height="14" rx="2" fill="${ph.outdoor ? "#d97706" : "#0f766e"}"/><text x="${f2(labelW + ph.end * scale + 4)}" y="${i * rowH + 14}" font-size="8.5" fill="#4b5263">${ph.days} d</text>`).join("");
  const body: Body = { svg: rows, w: labelW + chartW + 40, h: t.phases.length * rowH + 6 };
  const table = tableSvg("Schedule", ["Phase", "Start", "Finish", "Working days"], t.phases.map((ph) => [ph.name, ph.startDate, ph.endDate, String(ph.days)]), [260, 90, 90, 100]);
  return frameSheet(p, "Construction timeline", `Start ${o.startDate} - estimated finish ${t.finish} (${t.totalWorkDays} working days)`, body, [table], ["PRELIMINARY programme from rule-of-thumb productivity (orange = outdoor/weather-exposed work). Real durations depend on the contractor, labour, material supply, weather, approvals and curing times. Replace with your contractor's programme."]);
}
export { formatLength };
