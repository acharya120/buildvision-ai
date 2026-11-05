import type { DetailOptions, Floor, Project } from "../model/types";
import { DEFAULT_DETAIL, DEFAULT_LOADS, ROOM_COLORS } from "../model/defaults";
import { formatLength } from "../model/units";
import { isValidRect } from "../geometry/rect";
import { polygonPath, rayExitDistance } from "../geometry/polygon";
import { BRAND } from "../brand";
import { esc, niceScaleBar } from "../export/svg";
import { buildSite, siteSvg } from "../site/site";
import { areaSummary } from "./areas";
import { computeLoads } from "./loads";
import { buildStructure, type Beam, type Column, type StructureModel } from "./structure";

/**
 * Structural and site sheets, all drawn from the project's own values (walls, floor heights, the Details numbers).
 * They are INDICATIVE drawings: marks and schedules describe what is drawn, they are not a structural design.
 */
export type SheetKind = "columns" | "beams" | "footings" | "section" | "iso" | "site";
export const SHEET_LABELS: Record<SheetKind, string> = {
  columns: "Column layout",
  beams: "Beam layout",
  footings: "Foundation plan",
  section: "Structural section",
  iso: "3D frame (isometric)",
  site: "Site plan",
};

const f2 = (n: number) => Math.round(n * 100) / 100;
const detailOf = (p: Project): DetailOptions => p.detail ?? DEFAULT_DETAIL;
const INK = "#1f2430";

/* ---------- common helpers ---------- */

interface Row {
  cells: string[];
  bold?: boolean;
}
/** Plain SVG table. Returns the markup and its size. */
function table(x: number, y: number, title: string, head: string[], widths: number[], rows: Row[]): { svg: string; w: number; h: number } {
  const rh = 17;
  const w = widths.reduce((a, b) => a + b, 0);
  const out: string[] = [`<text x="${x}" y="${y + 12}" font-size="12" font-weight="bold" fill="${INK}">${esc(title)}</text>`];
  let yy = y + 20;
  const line = (cells: string[], bold: boolean, bg?: string) => {
    if (bg) out.push(`<rect x="${x}" y="${yy}" width="${w}" height="${rh}" fill="${bg}"/>`);
    let cx = x;
    cells.forEach((c, i) => {
      out.push(`<text x="${cx + 5}" y="${yy + 12}" font-size="10" ${bold ? 'font-weight="bold"' : ""} fill="${INK}">${esc(c.slice(0, Math.floor(widths[i] / 5.2)))}</text>`);
      cx += widths[i];
    });
    out.push(`<line x1="${x}" y1="${yy + rh}" x2="${x + w}" y2="${yy + rh}" stroke="#c6ccd6" stroke-width="0.6"/>`);
    yy += rh;
  };
  line(head, true, "#eef0f4");
  rows.forEach((r) => line(r.cells, !!r.bold));
  out.push(`<rect x="${x}" y="${y + 20}" width="${w}" height="${yy - y - 20}" fill="none" stroke="#8a93a3" stroke-width="0.8"/>`);
  return { svg: out.join(""), w, h: yy - y };
}

/** Wraps a drawing (already positioned from 0,0) with tables, notes and a title block. */
function compose(p: Project, sheet: SheetKind, subtitle: string, draw: { svg: string; w: number; h: number }, tables: Array<{ svg: string; w: number; h: number }>, notes: string[]): string {
  const M = 36;
  const gap = 22;
  // tables sit side by side under the drawing, wrapping when the sheet is full
  const W = Math.max(960, draw.w + M * 2);
  let tx = M;
  let ty = M + draw.h + gap;
  let rowH = 0;
  const placed: string[] = [];
  for (const t of tables) {
    if (tx + t.w > W - M && tx > M) {
      tx = M;
      ty += rowH + gap;
      rowH = 0;
    }
    placed.push(`<g transform="translate(${tx} ${ty})">${t.svg}</g>`);
    tx += t.w + gap;
    rowH = Math.max(rowH, t.h);
  }
  const bodyBottom = tables.length ? ty + rowH : M + draw.h;
  const noteY = bodyBottom + gap;
  const maxChars = Math.floor((W - M * 2) / 5.1);
  const lines = notes.flatMap((n) => {
    const out: string[] = [];
    let cur = "";
    for (const w of n.split(" ")) {
      if ((cur + " " + w).trim().length > maxChars) {
        out.push(cur);
        cur = w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) out.push(cur);
    return out;
  });
  const noteSvg = lines.map((n, i) => `<text x="${M}" y="${noteY + 12 + i * 14}" font-size="10" fill="#4b5263">${esc(n)}</text>`).join("");
  const tbY = noteY + lines.length * 14 + 16;
  const H = tbY + 92 + M;
  const fl = p.floors.length;
  const tb =
    `<rect x="${M}" y="${tbY}" width="${W - M * 2}" height="92" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` +
    `<line x1="${W - M - 250}" y1="${tbY}" x2="${W - M - 250}" y2="${tbY + 92}" stroke="${INK}" stroke-width="0.8"/>` +
    `<text x="${M + 10}" y="${tbY + 24}" font-size="16" font-weight="bold" fill="${INK}">${esc(SHEET_LABELS[sheet])}</text>` +
    `<text x="${M + 10}" y="${tbY + 42}" font-size="11" fill="#4b5263">${esc(subtitle)}</text>` +
    `<text x="${M + 10}" y="${tbY + 60}" font-size="11" fill="#4b5263">${esc(p.name)} - plot ${esc(formatLength(p.plot.width, p.unitSystem))} x ${esc(formatLength(p.plot.depth, p.unitSystem))} - ${fl} floor${fl === 1 ? "" : "s"}</text>` +
    `<text x="${M + 10}" y="${tbY + 80}" font-size="10" font-weight="bold" fill="#b91c1c">INDICATIVE ONLY - NOT A STRUCTURAL DESIGN - NOT FOR CONSTRUCTION</text>` +
    `<text x="${W - M - 240}" y="${tbY + 26}" font-size="13" font-weight="bold" fill="#136a52">${esc(BRAND.product)}</text>` +
    `<text x="${W - M - 240}" y="${tbY + 42}" font-size="10" fill="#4b5263">${esc(BRAND.credit)}</text>` +
    `<text x="${W - M - 240}" y="${tbY + 62}" font-size="10" fill="#4b5263">Date: ${new Date().toISOString().slice(0, 10)}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">` +
    `<title>${esc(p.name)} - ${esc(SHEET_LABELS[sheet])}</title><rect width="100%" height="100%" fill="#fff"/>` +
    `<rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    `<g transform="translate(${M + Math.max(0, (W - M * 2 - draw.w) / 2)} ${M})">${draw.svg}</g>${placed.join("")}${noteSvg}${tb}</svg>`
  );
}

interface View {
  s: number;
  X: (m: number) => number;
  Y: (m: number) => number;
  w: number;
  h: number;
  bx0: number;
  by0: number;
  bx1: number;
  by1: number;
}
const PAD = 70;
/** Scale and position for a plan-type drawing of the building footprint. */
function planView(p: Project, floor: Floor): View {
  const rects = [...floor.rooms, ...p.floors[0].rooms].filter(isValidRect);
  let xs = rects.flatMap((r) => [r.x, r.x + r.width]);
  let ys = rects.flatMap((r) => [r.y, r.y + r.depth]);
  for (const w of floor.walls) {
    xs = xs.concat([w.x1, w.x2]);
    ys = ys.concat([w.y1, w.y2]);
  }
  if (!xs.length) {
    xs = [0, p.plot.width];
    ys = [0, p.plot.depth];
  }
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const bw = Math.max(1, bx1 - bx0), bh = Math.max(1, by1 - by0);
  const s = Math.max(3, Math.min(80, 780 / bw, 620 / bh));
  return { s, X: (m) => PAD + (m - bx0) * s, Y: (m) => PAD + (m - by0) * s, w: bw * s + PAD * 2, h: bh * s + PAD * 2, bx0, by0, bx1, by1 };
}

/** Light background: walls and room names, so the structure can be read against the plan. */
function backdrop(floor: Floor, v: View): string {
  const out: string[] = [];
  for (const r of floor.rooms.filter(isValidRect)) {
    out.push(`<rect x="${f2(v.X(r.x))}" y="${f2(v.Y(r.y))}" width="${f2(r.width * v.s)}" height="${f2(r.depth * v.s)}" fill="#f6f7f9" stroke="none"/>`);
  }
  for (const w of floor.walls) {
    out.push(`<line x1="${f2(v.X(w.x1))}" y1="${f2(v.Y(w.y1))}" x2="${f2(v.X(w.x2))}" y2="${f2(v.Y(w.y2))}" stroke="#d3d8e0" stroke-width="${f2(Math.max(1.2, w.thickness * v.s))}"/>`);
  }
  for (const r of floor.rooms.filter(isValidRect)) {
    if (r.width * v.s > 50 && r.depth * v.s > 22) out.push(`<text x="${f2(v.X(r.x + r.width / 2))}" y="${f2(v.Y(r.y + r.depth / 2))}" font-size="9" text-anchor="middle" fill="#a3abba">${esc(r.name)}</text>`);
  }
  return out.join("");
}

/** Grid lines with bubbles and the distance between lines. */
function gridLayer(st: StructureModel, v: View): string {
  if (!st.bbox) return "";
  const out: string[] = [];
  const r = 9;
  const bubble = (cx: number, cy: number, t: string) => `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${r}" fill="#fff" stroke="#b45309" stroke-width="1"/><text x="${f2(cx)}" y="${f2(cy + 3.2)}" font-size="9" font-weight="bold" text-anchor="middle" fill="#7c3a07">${esc(t)}</text>`;
  const dash = `stroke="#b45309" stroke-opacity="0.55" stroke-width="0.7" stroke-dasharray="10 2 2 2"`;
  let last = -Infinity, lvl = 0;
  st.gridX.forEach((g, i) => {
    const x = v.X(g.pos);
    lvl = x - last < r * 2.2 ? (lvl + 1) % 2 : 0;
    last = x;
    const by = PAD - 34 - lvl * r * 2.2;
    out.push(`<line x1="${f2(x)}" y1="${f2(by + r)}" x2="${f2(x)}" y2="${f2(v.Y(st.bbox!.y1) + 14)}" ${dash}/>${bubble(x, by, g.label)}`);
    const nx = st.gridX[i + 1];
    if (nx && v.X(nx.pos) - x > 26) out.push(`<text x="${f2((x + v.X(nx.pos)) / 2)}" y="${PAD - 10}" font-size="8" text-anchor="middle" fill="#7a3d00">${esc(fmtDim(nx.pos - g.pos))}</text>`);
  });
  last = -Infinity;
  lvl = 0;
  st.gridY.forEach((g, i) => {
    const y = v.Y(g.pos);
    lvl = y - last < r * 2.2 ? (lvl + 1) % 2 : 0;
    last = y;
    const bx = PAD - 34 - lvl * r * 2.2;
    out.push(`<line x1="${f2(bx + r)}" y1="${f2(y)}" x2="${f2(v.X(st.bbox!.x1) + 14)}" y2="${f2(y)}" ${dash}/>${bubble(bx, y, g.label)}`);
    const ny = st.gridY[i + 1];
    if (ny && v.Y(ny.pos) - y > 26) out.push(`<text x="${PAD - 14}" y="${f2((y + v.Y(ny.pos)) / 2 + 3)}" font-size="8" text-anchor="end" fill="#7a3d00" transform="rotate(-90 ${PAD - 14} ${f2((y + v.Y(ny.pos)) / 2)})">${esc(fmtDim(ny.pos - g.pos))}</text>`);
  });
  return out.join("");
}
let unitSys: Project["unitSystem"] = "metric";
const fmtDim = (m: number) => formatLength(m, unitSys);

function scaleBar(p: Project, v: View): string {
  const sb = niceScaleBar(Math.max(v.bx1 - v.bx0, v.by1 - v.by0), p.unitSystem);
  const x = PAD, y = v.h - 22, len = sb.meters * v.s;
  return `<line x1="${f2(x)}" y1="${y}" x2="${f2(x + len)}" y2="${y}" stroke="${INK}" stroke-width="2"/><line x1="${f2(x)}" y1="${y - 4}" x2="${f2(x)}" y2="${y + 4}" stroke="${INK}"/><line x1="${f2(x + len)}" y1="${y - 4}" x2="${f2(x + len)}" y2="${y + 4}" stroke="${INK}"/><text x="${f2(x + len / 2)}" y="${y + 14}" font-size="9" text-anchor="middle" fill="${INK}">${esc(sb.label)}</text>`;
}

/** What each column connects to: used to name the kinds of column (corner, edge, interior). */
export interface MarkedColumn extends Column {
  mark: string;
  kind: string;
  ref: string;
}
const KINDS: Array<[string, string]> = [["C1", "Corner"], ["C2", "Edge / T-junction"], ["C3", "Interior (cross)"], ["C4", "Free end"]];

export function markColumns(st: StructureModel, refs?: Array<{ x: number; y: number; ref: string }>): MarkedColumn[] {
  const near = (x: number, y: number) => {
    let bi = -1, bd = 0.25 ** 2;
    st.columns.forEach((c, i) => {
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d <= bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  };
  const dirs = st.columns.map(() => new Set<string>());
  for (const b of st.beams) {
    const a = near(b.x1, b.y1), z = near(b.x2, b.y2);
    const horiz = Math.abs(b.y2 - b.y1) < 1e-3;
    if (a >= 0) dirs[a].add(horiz ? (b.x2 > b.x1 ? "E" : "W") : b.y2 > b.y1 ? "S" : "N");
    if (z >= 0) dirs[z].add(horiz ? (b.x2 > b.x1 ? "W" : "E") : b.y2 > b.y1 ? "N" : "S");
  }
  return st.columns.map((c, i) => {
    const d = dirs[i];
    const hasH = d.has("E") || d.has("W"), hasV = d.has("N") || d.has("S");
    let k = 3;
    if (d.size === 4) k = 2;
    else if (d.size === 3 || (d.size === 2 && !(hasH && hasV))) k = 1;
    else if (d.size === 2) k = 0;
    const ref = refs?.find((r) => Math.hypot(r.x - c.x, r.y - c.y) < 0.25)?.ref ?? "";
    return { ...c, mark: KINDS[k][0], kind: KINDS[k][1], ref };
  });
}

function groundLoads(p: Project) {
  const d = detailOf(p);
  const usedOwn = !!d.loads;
  const pp: Project = { ...p, detail: { ...d, loads: d.loads ?? DEFAULT_LOADS } };
  return { res: computeLoads(pp), usedOwn, opts: pp.detail!.loads! };
}

const kn = (n: number) => `${Math.round(n)} kN`;
const squareLabel = (m: number) => `${fmtDim(m)} x ${fmtDim(m)}`;

/* ---------- 1. column layout ---------- */
function columnSheet(p: Project): string {
  unitSys = p.unitSystem;
  const d = detailOf(p);
  const floor = p.floors[0];
  const st = buildStructure(floor, d.maxSpan);
  const v = planView(p, floor);
  const { res, usedOwn } = groundLoads(p);
  const refs = res?.floors[0]?.columns ?? [];
  const cols = markColumns(st, refs);
  const cs = Math.max(d.columnSize * v.s, 6);
  const g: string[] = [backdrop(floor, v), gridLayer(st, v)];
  for (const b of st.beams) g.push(`<line x1="${f2(v.X(b.x1))}" y1="${f2(v.Y(b.y1))}" x2="${f2(v.X(b.x2))}" y2="${f2(v.Y(b.y2))}" stroke="#d8b48a" stroke-width="1" stroke-dasharray="6 3"/>`);
  for (const c of cols) {
    g.push(`<rect x="${f2(v.X(c.x) - cs / 2)}" y="${f2(v.Y(c.y) - cs / 2)}" width="${f2(cs)}" height="${f2(cs)}" fill="#b91c1c" stroke="#fff" stroke-width="0.8"/>`);
    g.push(`<text x="${f2(v.X(c.x) + cs / 2 + 2)}" y="${f2(v.Y(c.y) - cs / 2 - 2)}" font-size="9" font-weight="bold" fill="#7f1d1d" stroke="#fff" stroke-width="2.4" paint-order="stroke">${c.mark}</text>`);
  }
  g.push(scaleBar(p, v));
  const rows: Row[] = [];
  for (const [mark, kind] of KINDS) {
    const mine = cols.filter((c) => c.mark === mark);
    if (!mine.length) continue;
    const loads = mine.map((c) => refs.find((r) => r.ref === c.ref)?.total ?? NaN).filter((x) => Number.isFinite(x));
    const refList = mine.map((c) => c.ref).filter(Boolean);
    rows.push({ cells: [mark, kind, String(mine.length), squareLabel(d.columnSize), loads.length ? `${Math.round(Math.min(...loads))} - ${Math.round(Math.max(...loads))} kN` : "-", refList.slice(0, 8).join(", ") + (refList.length > 8 ? ` +${refList.length - 8}` : "")] });
  }
  rows.push({ cells: ["Total", "", String(cols.length), "", res ? kn(res.totalToGround) : "", `${p.floors.length} floor(s), same grid`], bold: true });
  const t = table(0, 0, "Column schedule (ground floor)", ["Mark", "Type", "Nos", "Size", "Load at ground", "Grid positions"], [50, 130, 40, 110, 120, 260], rows);
  const notes = [
    `Columns sit at wall corners and junctions, plus extra ones where a wall run is longer than ${fmtDim(d.maxSpan)}. Size ${squareLabel(d.columnSize)} is the value you entered, not a calculated size.`,
    usedOwn ? "Loads use the values in Details > Load distribution (service loads, no load factors)." : "Loads use placeholder values (finishes 1.5, live 2.0, roof 1.5 kN/m2): switch on Load distribution in Details to set your own.",
  ];
  return compose(p, "columns", `${floor.name} - ${cols.length} columns on ${st.gridX.length} x ${st.gridY.length} grid lines`, { svg: g.join(""), w: v.w, h: v.h }, [t], notes);
}

/* ---------- 2. beam layout ---------- */
export interface BeamGroup {
  mark: string;
  span: number;
  width: number;
  count: number;
  total: number;
}
export function groupBeams(p: Project, st: StructureModel): { groups: BeamGroup[]; markOf: (b: Beam) => string } {
  const d = detailOf(p);
  const widthOf = (b: Beam) => {
    const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2;
    const edge = st.bbox ? mx < st.bbox.x0 + 0.3 || mx > st.bbox.x1 - 0.3 || my < st.bbox.y0 + 0.3 || my > st.bbox.y1 - 0.3 : false;
    return edge ? p.settings.exteriorWallThickness : p.settings.defaultWallThickness;
  };
  const keyOf = (b: Beam) => `${Math.round(Math.hypot(b.x2 - b.x1, b.y2 - b.y1) / 0.05) * 0.05}|${widthOf(b)}`;
  const map = new Map<string, BeamGroup>();
  for (const b of st.beams) {
    const k = keyOf(b);
    const span = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
    const g = map.get(k);
    if (g) {
      g.count++;
      g.total += span;
    } else map.set(k, { mark: "", span, width: widthOf(b), count: 1, total: span });
  }
  const groups = [...map.entries()].sort((a, b) => b[1].span - a[1].span).map(([, g], i) => ({ ...g, mark: `B${i + 1}` }));
  const byKey = new Map([...map.keys()].sort((a, b) => (map.get(b)!.span - map.get(a)!.span)).map((k, i) => [k, `B${i + 1}`]));
  return { groups, markOf: (b) => byKey.get(keyOf(b)) ?? "B?" };
}

function beamSheet(p: Project, floorId?: string): string {
  unitSys = p.unitSystem;
  const d = detailOf(p);
  const floor = p.floors.find((f) => f.id === floorId) ?? p.floors[0];
  const st = buildStructure(floor, d.maxSpan);
  const v = planView(p, floor);
  const { groups, markOf } = groupBeams(p, st);
  const cs = Math.max(d.columnSize * v.s, 6);
  const g: string[] = [backdrop(floor, v), gridLayer(st, v)];
  for (const b of st.beams) {
    const w = Math.max(3, (groups.find((x) => x.mark === markOf(b))?.width ?? 0.23) * v.s);
    const x1 = v.X(b.x1), y1 = v.Y(b.y1), x2 = v.X(b.x2), y2 = v.Y(b.y2);
    g.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#f1a14a" stroke-opacity="0.75" stroke-width="${f2(w)}"/><line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#b45309" stroke-width="0.8" stroke-dasharray="7 3"/>`);
    const horiz = Math.abs(b.y2 - b.y1) < 1e-3;
    g.push(`<text x="${f2((x1 + x2) / 2)}" y="${f2((y1 + y2) / 2 + (horiz ? -w / 2 - 2 : 0))}" ${horiz ? "" : `transform="rotate(-90 ${f2((x1 + x2) / 2)} ${f2((y1 + y2) / 2)}) translate(0 ${f2(-w / 2 - 2)})"`} font-size="9" font-weight="bold" text-anchor="middle" fill="#7c3a07" stroke="#fff" stroke-width="2.4" paint-order="stroke">${markOf(b)}</text>`);
  }
  for (const c of st.columns) g.push(`<rect x="${f2(v.X(c.x) - cs / 2)}" y="${f2(v.Y(c.y) - cs / 2)}" width="${f2(cs)}" height="${f2(cs)}" fill="#b91c1c" stroke="#fff" stroke-width="0.8"/>`);
  g.push(scaleBar(p, v));
  const rows: Row[] = groups.map((x) => ({ cells: [x.mark, fmtDim(x.span), `${fmtDim(x.width)} x ${fmtDim(d.beamDepth)}`, String(x.count), fmtDim(x.total)] }));
  rows.push({ cells: ["Total", "", "", String(st.beams.length), fmtDim(groups.reduce((a, x) => a + x.total, 0))], bold: true });
  const t = table(0, 0, `Beam schedule (${floor.name})`, ["Mark", "Span", "Width x depth", "Nos", "Total length"], [60, 100, 150, 50, 110], rows);
  const notes = [
    `Beams run along walls between columns. Width follows the wall thickness (outer ${fmtDim(p.settings.exteriorWallThickness)}, inner ${fmtDim(p.settings.defaultWallThickness)}); depth ${fmtDim(d.beamDepth)} is the value you entered.`,
    "Beams of the same span and width share a mark. Reinforcement is not shown: a structural engineer must design it.",
  ];
  return compose(p, "beams", `${floor.name} - ${st.beams.length} beams in ${groups.length} marks`, { svg: g.join(""), w: v.w, h: v.h }, [t], notes);
}

/* ---------- 3. foundation plan ---------- */
function footingSheet(p: Project): string {
  unitSys = p.unitSystem;
  const d = detailOf(p);
  const floor = p.floors[0];
  const st = buildStructure(floor, d.maxSpan);
  const v = planView(p, floor);
  const { res, usedOwn, opts } = groundLoads(p);
  const refs = res?.floors[0]?.columns ?? [];
  const cols = markColumns(st, refs);
  const fs = d.footingSize * v.s;
  const cs = Math.max(d.columnSize * v.s, 5);
  const g: string[] = [backdrop(floor, v), gridLayer(st, v)];
  for (const b of st.beams) g.push(`<line x1="${f2(v.X(b.x1))}" y1="${f2(v.Y(b.y1))}" x2="${f2(v.X(b.x2))}" y2="${f2(v.Y(b.y2))}" stroke="#8a6a3c" stroke-width="${f2(Math.max(2, 0.23 * v.s))}" stroke-opacity="0.35"/><line x1="${f2(v.X(b.x1))}" y1="${f2(v.Y(b.y1))}" x2="${f2(v.X(b.x2))}" y2="${f2(v.Y(b.y2))}" stroke="#8a6a3c" stroke-width="0.7" stroke-dasharray="6 3"/>`);
  let over = 0;
  const per = cols.map((c) => {
    const f = res?.footings.find((x) => x.ref === c.ref);
    if (f && !f.ok) over++;
    return { c, f };
  });
  for (const { c, f } of per) {
    const bad = f ? !f.ok : false;
    g.push(`<rect x="${f2(v.X(c.x) - fs / 2)}" y="${f2(v.Y(c.y) - fs / 2)}" width="${f2(fs)}" height="${f2(fs)}" fill="${bad ? "#fee2e2" : "#efe6d6"}" fill-opacity="0.85" stroke="${bad ? "#b91c1c" : "#8a6a3c"}" stroke-width="1.1" stroke-dasharray="5 3"/>`);
    g.push(`<rect x="${f2(v.X(c.x) - cs / 2)}" y="${f2(v.Y(c.y) - cs / 2)}" width="${f2(cs)}" height="${f2(cs)}" fill="#b91c1c" stroke="#fff" stroke-width="0.7"/>`);
    g.push(`<text x="${f2(v.X(c.x) + fs / 2 + 2)}" y="${f2(v.Y(c.y) + fs / 2 + 8)}" font-size="9" font-weight="bold" fill="${bad ? "#991b1b" : "#5b4526"}" stroke="#fff" stroke-width="2.4" paint-order="stroke">F${c.mark.slice(1)}</text>`);
  }
  g.push(scaleBar(p, v));
  const rows: Row[] = [];
  for (const [mark, kind] of KINDS) {
    const mine = per.filter((x) => x.c.mark === mark);
    if (!mine.length) continue;
    const loads = mine.map((x) => x.f?.load ?? NaN).filter((x) => Number.isFinite(x));
    const pr = mine.map((x) => x.f?.pressure ?? NaN).filter((x) => Number.isFinite(x));
    const need = mine.map((x) => x.f?.neededSide ?? NaN).filter((x) => Number.isFinite(x));
    const bad = mine.filter((x) => x.f && !x.f.ok).length;
    rows.push({ cells: [`F${mark.slice(1)}`, `under ${mark}`, String(mine.length), squareLabel(d.footingSize), loads.length ? `${Math.round(Math.max(...loads))} kN` : "-", pr.length ? `${Math.round(Math.max(...pr))}` : "-", need.length ? fmtDim(Math.max(...need)) : "-", bad ? `${bad} over` : "ok"] });
  }
  const t = table(0, 0, "Footing schedule", ["Mark", "Under", "Nos", "Size (entered)", "Max load", "Soil kN/m2", "Side needed", "Check"], [50, 70, 40, 130, 80, 80, 90, 70], rows);
  const notes = [
    `Footings are drawn at the size you entered (${squareLabel(d.footingSize)}, ${fmtDim(d.footingThickness)} thick, ${fmtDim(d.foundationDepth)} below ground). A red footing is over the allowed soil pressure of ${Math.round(opts.bearing)} kN/m2: it is reported, never resized for you.`,
    `${usedOwn ? "Loads from Details > Load distribution." : "Placeholder loads and soil pressure"} - ${over} of ${cols.length} footings over the limit. Soil must be investigated by a geotechnical engineer.`,
    "Brown strips are plinth / tie beams along the same lines as the beams.",
  ];
  return compose(p, "footings", `${floor.name} level - ${cols.length} footings`, { svg: g.join(""), w: v.w, h: v.h }, [t], notes);
}

/* ---------- floor picking for tall buildings ---------- */
export function pickFloors(n: number, maxDrawn: number): { idx: number[]; skipped: [number, number] | null } {
  if (n <= maxDrawn) return { idx: Array.from({ length: n }, (_, i) => i), skipped: null };
  const head = Math.max(1, maxDrawn - 2);
  const idx = [...Array.from({ length: head }, (_, i) => i), n - 1];
  return { idx, skipped: [head, n - 2] };
}

/* ---------- 4. structural section ---------- */
function sectionSheet(p: Project, axis: "x" | "y" = "y", at?: number): string {
  unitSys = p.unitSystem;
  const d = detailOf(p);
  const cut = at ?? (axis === "y" ? p.plot.depth / 2 : p.plot.width / 2);
  const sts = p.floors.map((f) => buildStructure(f, d.maxSpan));
  const hOf = (c: Column) => (axis === "y" ? c.x : c.y);
  const pOf = (c: Column) => (axis === "y" ? c.y : c.x);
  // snap the cut to the nearest grid line that has columns, so the section passes through real columns
  const all = sts[0].columns;
  let line = cut;
  if (all.length) line = pOf(all.reduce((a, c) => (Math.abs(pOf(c) - cut) < Math.abs(pOf(a) - cut) ? c : a)));
  const onLine = (st: StructureModel) => st.columns.filter((c) => Math.abs(pOf(c) - line) < 0.35).sort((a, b) => hOf(a) - hOf(b));
  const ground = onLine(sts[0]);
  const rooms = p.floors[0].rooms.filter(isValidRect);
  const h0 = ground.length ? hOf(ground[0]) : rooms.length ? Math.min(...rooms.map((r) => (axis === "y" ? r.x : r.y))) : 0;
  const h1 = ground.length ? hOf(ground[ground.length - 1]) : rooms.length ? Math.max(...rooms.map((r) => (axis === "y" ? r.x + r.width : r.y + r.depth))) : p.plot.width;
  const slabT = (d.loads ?? DEFAULT_LOADS).slabThickness;
  const pick = pickFloors(p.floors.length, 8);
  const heights = pick.idx.map((i) => p.floors[i].height);
  const gapH = pick.skipped ? 2.5 : 0;
  // levels, metres above ground level (GL = 0)
  const baseFFL = d.plinthHeight;
  let z = baseFFL;
  const tops: number[] = [];
  const ffl: number[] = [];
  pick.idx.forEach((i, k) => {
    if (pick.skipped && i === p.floors.length - 1) z += gapH;
    ffl.push(z);
    z += heights[k];
    tops.push(z);
  });
  const roofTop = tops[tops.length - 1] ?? baseFFL;
  const totalH = roofTop + d.parapetHeight + d.foundationDepth;
  const span = Math.max(1, h1 - h0) + 4;
  const s = Math.max(2, Math.min(640 / span, 520 / totalH));
  const x0 = 120;
  const baseY = 60 + (roofTop + d.parapetHeight) * s;
  const X = (h: number) => x0 + (h - h0 + 2) * s;
  const Z = (zz: number) => baseY - zz * s;
  const W = x0 + span * s + 330, H = Z(-d.foundationDepth) + 50;
  const o: string[] = [];
  o.push(`<defs><pattern id="gnd" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#a58a66" stroke-width="1"/></pattern></defs>`);
  // ground
  o.push(`<rect x="${x0 - 20}" y="${f2(Z(0))}" width="${f2(span * s + 40)}" height="${f2((d.foundationDepth + 0.6) * s)}" fill="url(#gnd)" opacity="0.55"/><line x1="${x0 - 30}" y1="${f2(Z(0))}" x2="${f2(x0 + span * s + 30)}" y2="${f2(Z(0))}" stroke="#5b4526" stroke-width="2"/>`);
  const colW = Math.max(d.columnSize * s, 5);
  const ft = d.footingThickness * s;
  const fsz = d.footingSize * s;
  const rect = (xa: number, ya: number, w: number, h: number, fill: string, stroke = "#3b4252", sw = 0.8) => `<rect x="${f2(xa)}" y="${f2(ya)}" width="${f2(w)}" height="${f2(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  // footings, plinth beam, columns
  for (const c of ground) {
    const cx = X(hOf(c));
    o.push(rect(cx - fsz / 2, Z(-d.foundationDepth) - ft, fsz, ft, "#c9b08a", "#5b4526", 1));
  }
  for (let i = 0; i + 1 < ground.length; i++) {
    const a = X(hOf(ground[i])), b = X(hOf(ground[i + 1]));
    const bh = Math.min(d.beamDepth, 0.45) * s;
    o.push(rect(a, Z(baseFFL) , b - a, bh, "#e0c9a6", "#5b4526", 0.8));
  }
  // slabs, beams
  pick.idx.forEach((fi, k) => {
    const cols = onLine(sts[fi]);
    const top = tops[k];
    const bottom = ffl[k];
    for (const c of cols) o.push(rect(X(hOf(c)) - colW / 2, Z(top), colW, (top - Math.min(bottom, top)) * s + (k === 0 ? (baseFFL + d.foundationDepth - d.footingThickness) * s : 0), "#cfd4dc", "#3b4252", 0.8));
    for (let i = 0; i + 1 < cols.length; i++) {
      const a = X(hOf(cols[i])) + colW / 2, b = X(hOf(cols[i + 1])) - colW / 2;
      if (b > a) o.push(rect(a, Z(top), b - a, d.beamDepth * s, "#f1b46f", "#b45309", 0.8));
    }
    const left = cols.length ? X(hOf(cols[0])) - colW / 2 : X(h0), right = cols.length ? X(hOf(cols[cols.length - 1])) + colW / 2 : X(h1);
    o.push(rect(left - 0.6 * s, Z(top), right - left + 1.2 * s, Math.max(2, slabT * s), "#8fb3d9", "#2f5f94", 1));
    o.push(`<text x="${f2((left + right) / 2)}" y="${f2(Z(bottom) - Math.max(4, (top - bottom) * s * 0.45))}" font-size="10" text-anchor="middle" fill="#6b7384">${esc(p.floors[fi].name)}</text>`);
  });
  if (pick.skipped) {
    const gy = Z(ffl[pick.idx.length - 1] - gapH / 2);
    o.push(`<text x="${f2(x0 + span * s / 2)}" y="${f2(gy)}" font-size="9" text-anchor="middle" fill="#8a93a3">~ floors ${pick.skipped[0] + 1} to ${pick.skipped[1] + 1} not drawn ~</text>`);
  }
  // parapet
  o.push(rect(X(h0) - colW / 2, Z(roofTop + d.parapetHeight), 0.115 * s + 2, d.parapetHeight * s, "#d9dde3"));
  o.push(rect(X(h1) + colW / 2 - 0.115 * s - 2, Z(roofTop + d.parapetHeight), 0.115 * s + 2, d.parapetHeight * s, "#d9dde3"));
  // level markers
  const lvl = (zz: number, label: string, xx: number) => `<g><line x1="${xx}" y1="${f2(Z(zz))}" x2="${xx + 70}" y2="${f2(Z(zz))}" stroke="#2f5f94" stroke-width="0.8"/><path d="M${xx + 6} ${f2(Z(zz))} l5 -7 l5 7 z" fill="none" stroke="#2f5f94" stroke-width="0.8"/><text x="${xx + 2}" y="${f2(Z(zz)) - 3}" font-size="9" fill="#2f5f94">${esc(label)}</text></g>`;
  const L = (zz: number) => (zz >= 0 ? "+" : "-") + Math.abs(zz).toFixed(2);
  o.push(lvl(0, `GL ${L(0)}`, 6));
  o.push(lvl(-d.foundationDepth, `Founding ${L(-d.foundationDepth)}`, 6));
  pick.idx.forEach((fi, k) => o.push(lvl(ffl[k], `${p.floors[fi].name} ${L(ffl[k])}`, 6)));
  o.push(lvl(roofTop, `Roof slab ${L(roofTop)}`, 6));
  // callouts
  const cx0 = x0 + span * s + 24;
  const callouts: Array<[number, number, string]> = [];
  const g0 = ground[Math.floor(ground.length / 2)];
  const gx = g0 ? X(hOf(g0)) : X((h0 + h1) / 2);
  callouts.push([gx + fsz / 2, Z(-d.foundationDepth) - ft / 2, `Footing ${squareLabel(d.footingSize)} x ${fmtDim(d.footingThickness)}`]);
  callouts.push([gx + colW / 2, Z(baseFFL / 2 + 0.1), `Column ${squareLabel(d.columnSize)}`]);
  callouts.push([X(h1) - 1, Z(tops[0] ?? baseFFL) + d.beamDepth * s * 0.5, `Beam depth ${fmtDim(d.beamDepth)}`]);
  callouts.push([X(h1), Z(roofTop) + Math.max(1, slabT * s) / 2, `Slab ${fmtDim(slabT)} thick`]);
  callouts.push([X(h1), Z(roofTop + d.parapetHeight / 2), `Parapet ${fmtDim(d.parapetHeight)} high`]);
  callouts.push([X(h0) + (ground.length > 1 ? (X(hOf(ground[1])) - X(hOf(ground[0]))) / 2 : 10), Z(baseFFL) + 3, `Plinth beam, plinth ${fmtDim(d.plinthHeight)} above GL`]);
  callouts.sort((a, b) => a[1] - b[1]);
  callouts.forEach(([px, py, t], i) => {
    const ty = 70 + i * 26;
    o.push(`<polyline points="${f2(px)},${f2(py)} ${f2(cx0 - 6)},${f2(ty - 3)} ${f2(cx0)},${f2(ty - 3)}" fill="none" stroke="#7a3d00" stroke-width="0.7"/><circle cx="${f2(px)}" cy="${f2(py)}" r="2" fill="#7a3d00"/><text x="${f2(cx0 + 3)}" y="${f2(ty)}" font-size="10" fill="${INK}">${esc(t)}</text>`);
  });
  const rows: Row[] = [
    { cells: ["Foundation depth below ground", fmtDim(d.foundationDepth)] },
    { cells: ["Plinth height above ground", fmtDim(d.plinthHeight)] },
    ...p.floors.slice(0, 12).map((f, i) => ({ cells: [`${f.name} floor-to-floor`, fmtDim(f.height)] }) as Row),
    { cells: ["Total height to roof slab", fmtDim(p.floors.reduce((a, f) => a + f.height, 0) + d.plinthHeight)], bold: true },
  ];
  const t = table(0, 0, "Levels and heights", ["Item", "Value"], [260, 110], rows);
  const notes = [
    `Cut along the grid line through the columns nearest your chosen position (${axis === "y" ? "horizontal" : "vertical"} cut). Heights are your floor heights; foundation depth, plinth, footing thickness and parapet are the values in Details.`,
    "Wall infill, stairs, reinforcement and the roof finish are not drawn.",
  ];
  return compose(p, "section", `Typical frame section - ${p.floors.length} floor(s)`, { svg: o.join(""), w: W, h: H }, [t], notes);
}

/* ---------- 5. isometric frame ---------- */
const C30 = Math.cos(Math.PI / 6);
interface Box {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  top: string; left: string; right: string; stroke: string; alpha?: number;
}
function isoSheet(p: Project): string {
  unitSys = p.unitSystem;
  const d = detailOf(p);
  const sts = p.floors.map((f) => buildStructure(f, d.maxSpan));
  const slabT = (d.loads ?? DEFAULT_LOADS).slabThickness;
  // keep the file light: at most ~5000 boxes
  const perFloor = sts.map((st, i) => st.columns.length + st.beams.length + p.floors[i].rooms.length);
  const avg = Math.max(1, perFloor.reduce((a, b) => a + b, 0) / Math.max(1, perFloor.length));
  const pick = pickFloors(p.floors.length, Math.max(2, Math.floor(5000 / avg)));
  const gap = pick.skipped ? 2 : 0;
  const boxes: Array<Box & { key: number; lvl: number }> = [];
  const ffl: number[] = [];
  let z = 0;
  pick.idx.forEach((fi, k) => {
    if (pick.skipped && fi === p.floors.length - 1) z += gap;
    const f = p.floors[fi];
    const st = sts[fi];
    const z0 = z, z1 = z + f.height;
    ffl.push(z0);
    if (k === 0 && d.footings) {
      for (const c of st.columns) boxes.push({ x0: c.x - d.footingSize / 2, x1: c.x + d.footingSize / 2, y0: c.y - d.footingSize / 2, y1: c.y + d.footingSize / 2, z0: -d.footingThickness, z1: 0, top: "#d8c3a0", left: "#b9a07a", right: "#9d8461", stroke: "#5b4526", key: c.x + c.y, lvl: 0 });
    }
    const cs = d.columnSize / 2;
    for (const c of st.columns) boxes.push({ x0: c.x - cs, x1: c.x + cs, y0: c.y - cs, y1: c.y + cs, z0, z1: z1, top: "#e3e6eb", left: "#b6bdc8", right: "#9099a8", stroke: "#4a5262", key: c.x + c.y, lvl: 1 });
    for (const b of st.beams) {
      const horiz = Math.abs(b.y2 - b.y1) < 1e-3;
      const w = 0.115;
      const xa = Math.min(b.x1, b.x2), xb = Math.max(b.x1, b.x2), ya = Math.min(b.y1, b.y2), yb = Math.max(b.y1, b.y2);
      boxes.push({ x0: horiz ? xa : xa - w, x1: horiz ? xb : xa + w, y0: horiz ? ya - w : ya, y1: horiz ? ya + w : yb, z0: z1 - d.beamDepth, z1: z1, top: "#f7c98f", left: "#e0a05a", right: "#c98336", stroke: "#8a4b0b", key: (xa + xb + ya + yb) / 2 + 0.2, lvl: 2 });
    }
    for (const r of f.rooms.filter(isValidRect)) boxes.push({ x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.depth, z0: z1 - slabT, z1: z1, top: "#9bc1e6", left: "#7aa6d1", right: "#6591bf", stroke: "#2f5f94", alpha: 0.5, key: r.x + r.y + r.width / 2 + r.depth / 2, lvl: 3 });
    z = z1;
  });
  const roof = z;
  const dep = (b: Box & { key: number; lvl: number }) => b.x0 + b.y0 + (b.x1 + b.y1) * 0.001;
  const k = 1;
  const proj = (x: number, y: number, zz: number) => ({ px: (x - y) * C30 * k, py: (x + y) * 0.5 * k - zz * k });
  // bounds in metres, then fit
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boxes) for (const [x, y, zz] of [[b.x0, b.y1, b.z0], [b.x1, b.y0, b.z0], [b.x0, b.y0, b.z1], [b.x1, b.y1, b.z0]] as const) {
    const q = proj(x, y, zz);
    minX = Math.min(minX, q.px); maxX = Math.max(maxX, q.px); minY = Math.min(minY, q.py); maxY = Math.max(maxY, q.py);
  }
  if (!boxes.length) {
    minX = 0; maxX = 1; minY = 0; maxY = 1;
  }
  const s = Math.max(1.5, Math.min(900 / Math.max(1, maxX - minX), 640 / Math.max(1, maxY - minY)));
  const ox = 40 - minX * s + 100, oy = 40 - minY * s;
  const P = (x: number, y: number, zz: number) => {
    const q = proj(x, y, zz);
    return `${f2(ox + q.px * s)},${f2(oy + q.py * s)}`;
  };
  // painter order: lowest level first within a floor band, far to near
  boxes.sort((a, b) => (Math.floor((a.z0 + 1e-6) / 1) - Math.floor((b.z0 + 1e-6) / 1)) || a.lvl - b.lvl || dep(a) - dep(b));
  const o: string[] = [];
  for (const b of boxes) {
    const op = b.alpha ? ` fill-opacity="${b.alpha}"` : "";
    o.push(`<polygon points="${P(b.x0, b.y0, b.z1)} ${P(b.x1, b.y0, b.z1)} ${P(b.x1, b.y1, b.z1)} ${P(b.x0, b.y1, b.z1)}" fill="${b.top}"${op} stroke="${b.stroke}" stroke-width="0.4"/>`);
    o.push(`<polygon points="${P(b.x0, b.y1, b.z1)} ${P(b.x1, b.y1, b.z1)} ${P(b.x1, b.y1, b.z0)} ${P(b.x0, b.y1, b.z0)}" fill="${b.left}"${op} stroke="${b.stroke}" stroke-width="0.4"/>`);
    o.push(`<polygon points="${P(b.x1, b.y0, b.z1)} ${P(b.x1, b.y1, b.z1)} ${P(b.x1, b.y1, b.z0)} ${P(b.x1, b.y0, b.z0)}" fill="${b.right}"${op} stroke="${b.stroke}" stroke-width="0.4"/>`);
  }
  const W = Math.max(960, (maxX - minX) * s + 240), H = (maxY - minY) * s + 90;
  const lab: string[] = [];
  const legend = [["Footings", "#b9a07a"], ["Columns", "#b6bdc8"], ["Beams", "#e0a05a"], ["Slabs", "#7aa6d1"]] as const;
  legend.forEach(([t, c], i) => lab.push(`<rect x="12" y="${14 + i * 18}" width="12" height="12" fill="${c}" stroke="#4a5262" stroke-width="0.5"/><text x="30" y="${24 + i * 18}" font-size="10" fill="${INK}">${t}</text>`));
  if (pick.skipped) lab.push(`<text x="12" y="${14 + 4 * 18 + 8}" font-size="9" fill="#8a4b0b">Floors ${pick.skipped[0] + 1} to ${pick.skipped[1] + 1} are not drawn (file size).</text>`);
  const rows: Row[] = pick.idx.map((fi, i) => ({ cells: [p.floors[fi].name, `+${(ffl[i] + d.plinthHeight).toFixed(2)} m`, String(sts[fi].columns.length), String(sts[fi].beams.length)] }));
  const t = table(0, 0, "Levels and members drawn", ["Floor", "Level (FFL)", "Columns", "Beams"], [150, 100, 80, 80], rows.slice(0, 16));
  const notes = [`Isometric view of the same columns, beams, footings and slabs shown on the plans. Total frame height ${fmtDim(roof)} above the footings' top. Members use the sizes you entered in Details.`];
  return compose(p, "iso", `${p.floors.length} floor(s), ${boxes.length} members drawn`, { svg: `<g transform="translate(0 0)">${o.join("")}${lab.join("")}</g>`, w: W, h: H }, [t], notes);
}

/* ---------- 6. site plan ---------- */
function siteSheet(p: Project): string {
  unitSys = p.unitSystem;
  const floor = p.floors[0];
  const rooms = floor.rooms.filter(isValidRect);
  const m = 70;
  const s = Math.max(2, Math.min(70, 760 / p.plot.width, 560 / p.plot.depth));
  const X = (x: number) => m + x * s, Y = (y: number) => m + y * s;
  const W = p.plot.width * s + m * 2, H = p.plot.depth * s + m * 2 + 24;
  const o: string[] = [];
  // road on the side of the main entrance when a site is modelled, otherwise assumed at the bottom
  const site = buildSite(p);
  const ent = site?.gates.find((g) => g.kind === "entrance");
  const side = ent?.side ?? "bottom";
  const road = (() => {
    const t = 38;
    if (side === "top") return { x: X(0) - 20, y: Y(0) - t - 8, w: p.plot.width * s + 40, h: t };
    if (side === "left") return { x: X(0) - t - 8, y: Y(0) - 20, w: t, h: p.plot.depth * s + 40 };
    if (side === "right") return { x: X(p.plot.width) + 8, y: Y(0) - 20, w: t, h: p.plot.depth * s + 40 };
    return { x: X(0) - 20, y: Y(p.plot.depth) + 8, w: p.plot.width * s + 40, h: t };
  })();
  o.push(`<rect x="${f2(road.x)}" y="${f2(road.y)}" width="${f2(road.w)}" height="${f2(road.h)}" fill="#8b919c"/><text x="${f2(road.x + road.w / 2)}" y="${f2(road.y + road.h / 2 + 3)}" font-size="10" text-anchor="middle" fill="#fff" ${road.h > road.w ? `transform="rotate(-90 ${f2(road.x + road.w / 2)} ${f2(road.y + road.h / 2)})"` : ""}>${ent ? "ROAD (at main entrance)" : "ROAD (assumed, front)"}</text>`);
  o.push(p.plot.polygon
    ? `<path d="${polygonPath(p.plot.polygon, X, Y)}" fill="#f4f8ee" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="9 4"/>`
    : `<rect x="${X(0)}" y="${Y(0)}" width="${f2(p.plot.width * s)}" height="${f2(p.plot.depth * s)}" fill="#f4f8ee" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="9 4"/>`);
  if (site) o.push(siteSvg(site, X, Y, s, 1));
  for (const r of rooms) o.push(`<rect x="${f2(X(r.x))}" y="${f2(Y(r.y))}" width="${f2(r.width * s)}" height="${f2(r.depth * s)}" fill="${ROOM_COLORS[r.type]}" stroke="#4a5262" stroke-width="0.7"/>`);
  for (const w of floor.walls) o.push(`<line x1="${f2(X(w.x1))}" y1="${f2(Y(w.y1))}" x2="${f2(X(w.x2))}" y2="${f2(Y(w.y2))}" stroke="#1f2430" stroke-width="${f2(Math.max(1, w.thickness * s))}"/>`);
  // distances from the building to each plot edge
  const dimLine = (x1: number, y1: number, x2: number, y2: number, label: string) => `<g stroke="#7a3d00" stroke-width="0.8"><line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/></g><rect x="${f2((x1 + x2) / 2 - label.length * 2.8)}" y="${f2((y1 + y2) / 2 - 7)}" width="${f2(label.length * 5.6)}" height="12" fill="#fff" fill-opacity="0.85"/><text x="${f2((x1 + x2) / 2)}" y="${f2((y1 + y2) / 2 + 3)}" font-size="9" text-anchor="middle" fill="#7a3d00">${esc(label)}</text>`;
  let setbacks = { left: 0, right: 0, top: 0, bottom: 0 };
  if (rooms.length) {
    const bx0 = Math.min(...rooms.map((r) => r.x)), bx1 = Math.max(...rooms.map((r) => r.x + r.width));
    const by0 = Math.min(...rooms.map((r) => r.y)), by1 = Math.max(...rooms.map((r) => r.y + r.depth));
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    const pg = p.plot.polygon;
    const dist = (x: number, y: number, dx: number, dy: number, fallback: number) => (pg ? rayExitDistance(pg, x, y, dx, dy) : fallback);
    setbacks = {
      left: dist(bx0, cy, -1, 0, bx0), right: dist(bx1, cy, 1, 0, p.plot.width - bx1),
      top: dist(cx, by0, 0, -1, by0), bottom: dist(cx, by1, 0, 1, p.plot.depth - by1),
    };
    if (setbacks.left > 0.05) o.push(dimLine(X(bx0 - setbacks.left), Y(cy), X(bx0), Y(cy), fmtDim(setbacks.left)));
    if (setbacks.right > 0.05) o.push(dimLine(X(bx1), Y(cy), X(bx1 + setbacks.right), Y(cy), fmtDim(setbacks.right)));
    if (setbacks.top > 0.05) o.push(dimLine(X(cx), Y(by0 - setbacks.top), X(cx), Y(by0), fmtDim(setbacks.top)));
    if (setbacks.bottom > 0.05) o.push(dimLine(X(cx), Y(by1), X(cx), Y(by1 + setbacks.bottom), fmtDim(setbacks.bottom)));
  }
  // plot dimensions
  o.push(`<text x="${f2(X(p.plot.width / 2))}" y="${m - 14}" font-size="11" text-anchor="middle" fill="#c0392b">Plot width ${esc(fmtDim(p.plot.width))}</text>`);
  o.push(`<text x="${m - 18}" y="${f2(Y(p.plot.depth / 2))}" font-size="11" text-anchor="middle" fill="#c0392b" transform="rotate(-90 ${m - 18} ${f2(Y(p.plot.depth / 2))})">Plot depth ${esc(fmtDim(p.plot.depth))}</text>`);
  // north arrow
  const nx = W - 46, ny = 56;
  o.push(`<g transform="translate(${nx} ${ny}) rotate(${p.northAngle ?? 0})"><circle r="22" fill="#fff" stroke="${INK}"/><path d="M0 -17 L7 10 L0 5 L-7 10 Z" fill="${INK}"/><text y="-24" font-size="11" font-weight="bold" text-anchor="middle" fill="${INK}">N</text></g>`);
  const v: View = { s, X, Y, w: W, h: H, bx0: 0, by0: 0, bx1: p.plot.width, by1: p.plot.depth };
  o.push(scaleBar(p, v));
  const a = areaSummary(p);
  const sys = p.unitSystem;
  const fa = (n: number) => (sys === "metric" ? `${n.toFixed(1)} m2` : `${(n * 10.7639).toFixed(0)} sq ft`);
  const rows: Row[] = [
    { cells: ["Plot area", fa(a.plotArea)] },
    ...a.floors.slice(0, 14).map((f) => ({ cells: [`${f.name} built-up`, fa(f.builtUp)] }) as Row),
    { cells: ["Total built-up area", fa(a.totalBuiltUp)], bold: true },
    { cells: ["FAR (total built-up / plot)", a.far.toFixed(2)], bold: true },
    { cells: ["Ground coverage", `${a.coveragePct.toFixed(1)} %`] },
    { cells: ["Open area (not built on)", fa(a.openArea)] },
  ];
  const t1 = table(0, 0, "Area statement", ["Item", "Value"], [230, 110], rows);
  const t2 = table(0, 0, "Distance from building to plot edge", ["Edge", "Distance"], [230, 110], [
    { cells: ["Left", fmtDim(setbacks.left)] }, { cells: ["Right", fmtDim(setbacks.right)] }, { cells: ["Top of plan", fmtDim(setbacks.top)] }, { cells: ["Bottom of plan", fmtDim(setbacks.bottom)] },
  ]);
  const notes = ["Distances are measured from the outer room edges to the plot boundary. Compare them with your local setback rules. The road side is taken from your main gate when a site is modelled, otherwise assumed at the bottom.", "FAR counts every floor in full; local rules may exempt stairs, parking or balconies."];
  return compose(p, "site", `Plot ${fmtDim(p.plot.width)} x ${fmtDim(p.plot.depth)} - ground floor footprint`, { svg: o.join(""), w: W, h: H }, [t1, t2], notes);
}

export interface SheetOptions {
  floorId?: string;
  axis?: "x" | "y";
  at?: number;
}
/** One structural or site sheet as an SVG document string. */
export function sheetSvg(p: Project, kind: SheetKind, o: SheetOptions = {}): string {
  switch (kind) {
    case "columns": return columnSheet(p);
    case "beams": return beamSheet(p, o.floorId);
    case "footings": return footingSheet(p);
    case "section": return sectionSheet(p, o.axis, o.at);
    case "iso": return isoSheet(p);
    case "site": return siteSheet(p);
  }
}
