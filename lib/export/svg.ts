import { buildSite, siteSvg } from "../site/site";
import { detailSvg } from "../structure/detailSvg";
import { BRAND } from "../brand";
import type { Floor, Project } from "../model/types";
import { ROOM_COLORS, ROOM_TYPE_LABELS } from "../model/defaults";
import { formatArea, formatLength, formatPlotArea, M_PER_FT } from "../model/units";
import { isValidRect } from "../geometry/rect";
import { polygonPath } from "../geometry/polygon";
import { plotArea } from "../model/plotShapes";
import { openingGeometry, wallPolygon } from "../geometry/walls";
import { DISCLAIMER_SHORT } from "./disclaimer";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const f2 = (n: number) => Math.round(n * 100) / 100;

/** Pick a round scale-bar length (in metres) for the plot size and unit system. */
export function niceScaleBar(plotMax: number, system: Project["unitSystem"]): { meters: number; label: string } {
  const steps = system === "metric" ? [0.5, 1, 2, 5, 10, 20, 50] : [1, 2, 5, 10, 20, 50, 100].map((ft) => ft * M_PER_FT);
  const target = plotMax / 4;
  let pick = steps[0];
  for (const s of steps) if (s <= target) pick = s;
  return { meters: pick, label: formatLength(pick, system) };
}

export interface SvgOptions {
  showGrid?: boolean;
  showTitleBlock?: boolean;
  /** draw garden, paths, gates and trees on the ground floor when the project has them (default true) */
  showSite?: boolean;
  /** draw the whole plot even when the building is a small part of it */
  fullPlot?: boolean;
  /** always zoom to the building (used for small previews) */
  focusBuilding?: boolean;
  /** pixels per metre */
  scale?: number;
  /** floor to draw faintly underneath (dashed) */
  ghostFloor?: Floor | null;
}

function dimension(x1: number, y1: number, x2: number, y2: number, offset: number, label: string): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  const a = { x: x1 + nx, y: y1 + ny };
  const b = { x: x2 + nx, y: y2 + ny };
  const tick = 5;
  const ux = dx / len;
  const uy = dy / len;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  return (
    `<g stroke="#7a3d00" stroke-width="0.8" fill="none">` +
    `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(a.x)}" y2="${f2(a.y)}" stroke-dasharray="2 2" opacity="0.6"/>` +
    `<line x1="${f2(x2)}" y1="${f2(y2)}" x2="${f2(b.x)}" y2="${f2(b.y)}" stroke-dasharray="2 2" opacity="0.6"/>` +
    `<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(b.x)}" y2="${f2(b.y)}"/>` +
    `<line x1="${f2(a.x - (ux - uy) * tick)}" y1="${f2(a.y - (uy + ux) * tick)}" x2="${f2(a.x + (ux - uy) * tick)}" y2="${f2(a.y + (uy + ux) * tick)}"/>` +
    `<line x1="${f2(b.x - (ux - uy) * tick)}" y1="${f2(b.y - (uy + ux) * tick)}" x2="${f2(b.x + (ux - uy) * tick)}" y2="${f2(b.y + (uy + ux) * tick)}"/>` +
    `</g>` +
    `<text x="${f2(midX)}" y="${f2(midY)}" transform="rotate(${f2(angle)} ${f2(midX)} ${f2(midY)}) translate(0 -3)" font-size="10" text-anchor="middle" fill="#7a3d00">${esc(label)}</text>`
  );
}

let clipCounter = 0;

/** Dimensioned, scaled floor-plan drawing as a standalone SVG document string (real vector geometry). */
export function planToSvg(p: Project, floorId: string, opts: SvgOptions = {}): string {
  const floor = p.floors.find((f) => f.id === floorId) ?? p.floors[0];
  const showTitle = opts.showTitleBlock !== false;
  // when the building is a small part of a big plot, draw only the area around it (the plot size stays in the title block)
  const rooms0 = p.floors.flatMap((f) => f.rooms).filter(isValidRect);
  let vx = 0, vy = 0, vw = p.plot.width, vd = p.plot.depth;
  let cropped = false;
  if (rooms0.length && opts.fullPlot !== true) {
    const bx0 = Math.min(...rooms0.map((r) => r.x)), by0 = Math.min(...rooms0.map((r) => r.y));
    const bx1 = Math.max(...rooms0.map((r) => r.x + r.width)), by1 = Math.max(...rooms0.map((r) => r.y + r.depth));
    if (opts.focusBuilding || (bx1 - bx0) * (by1 - by0) < 0.1 * p.plot.width * p.plot.depth) {
      const pad = Math.max(opts.focusBuilding ? 3 : 6, (opts.focusBuilding ? 0.18 : 0.35) * Math.max(bx1 - bx0, by1 - by0));
      vx = Math.max(0, bx0 - pad); vy = Math.max(0, by0 - pad);
      vw = Math.min(p.plot.width, bx1 + pad) - vx; vd = Math.min(p.plot.depth, by1 + pad) - vy;
      cropped = true;
    }
  }
  const clipId = `view${++clipCounter}`; // unique, because several SVGs can sit in one HTML page
  const plotMax = Math.max(vw, vd);
  const s = opts.scale ?? Math.max(4, 700 / plotMax);
  const margin = p.detail?.grid ? 104 : 80; // a little more room for the grid-line labels when details are on
  const titleH = showTitle ? 120 : 0;
  const planW = vw * s;
  const planH = vd * s;
  const W = Math.max(planW + margin * 2, 640);
  const H = planH + margin * 2 + titleH;
  const ox = (W - planW) / 2;
  const oy = margin;
  const X = (m: number) => f2(ox + (m - vx) * s);
  const Y = (m: number) => f2(oy + (m - vy) * s);
  const sys = p.unitSystem;

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${f2(W)}" height="${f2(H)}" viewBox="0 0 ${f2(W)} ${f2(H)}" font-family="Arial, Helvetica, sans-serif">`);
  out.push(`<title>${esc(p.name)} - ${esc(floor.name)}</title>`);
  out.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  if (opts.showGrid !== false) {
    const step = sys === "metric" ? 1 : M_PER_FT * 1;
    const major = sys === "metric" ? 1 : M_PER_FT * 5;
    for (let g = Math.ceil(vx / step) * step; g <= vx + vw + 1e-6; g += step) {
      const isMajor = Math.abs(g / major - Math.round(g / major)) < 1e-6;
      out.push(`<line x1="${X(g)}" y1="${Y(vy)}" x2="${X(g)}" y2="${Y(vy + vd)}" stroke="${isMajor ? "#cfd4dc" : "#eceef2"}" stroke-width="0.5"/>`);
    }
    for (let g = Math.ceil(vy / step) * step; g <= vy + vd + 1e-6; g += step) {
      const isMajor = Math.abs(g / major - Math.round(g / major)) < 1e-6;
      out.push(`<line x1="${X(vx)}" y1="${Y(g)}" x2="${X(vx + vw)}" y2="${Y(g)}" stroke="${isMajor ? "#cfd4dc" : "#eceef2"}" stroke-width="0.5"/>`);
    }
  }

  out.push(`<clipPath id="${clipId}"><rect x="${f2(ox)}" y="${f2(oy)}" width="${f2(planW)}" height="${f2(planH)}"/></clipPath><g clip-path="url(#${clipId})">`);
  out.push(p.plot.polygon
    ? `<path d="${polygonPath(p.plot.polygon, X, Y)}" fill="none" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="8 4"/>`
    : `<rect x="${X(0)}" y="${Y(0)}" width="${f2(p.plot.width * s)}" height="${f2(p.plot.depth * s)}" fill="none" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="8 4"/>`);

  if (opts.showSite !== false && floor === p.floors[0]) {
    const site = buildSite(p);
    if (site) out.push(siteSvg(site, X, Y, s, 1));
  }
  out.push("</g>");

  if (opts.ghostFloor) {
    for (const r of opts.ghostFloor.rooms.filter(isValidRect))
      out.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${f2(r.width * s)}" height="${f2(r.depth * s)}" fill="none" stroke="#8892a6" stroke-width="0.8" stroke-dasharray="3 3"/>`);
  }

  for (const r of floor.rooms.filter(isValidRect)) {
    out.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${f2(r.width * s)}" height="${f2(r.depth * s)}" fill="${ROOM_COLORS[r.type]}" stroke="#6b7280" stroke-width="0.6"/>`);
  }
  for (const w of floor.walls) {
    const pts = wallPolygon(w)
      .map((pt) => `${X(pt.x)},${Y(pt.y)}`)
      .join(" ");
    out.push(`<polygon points="${pts}" fill="#2b2f3a"/>`);
  }
  for (const o of floor.openings) {
    const w = floor.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const g = openingGeometry(w, o);
    const t = Math.max(w.thickness * s, 3);
    out.push(`<line x1="${X(g.p0.x)}" y1="${Y(g.p0.y)}" x2="${X(g.p1.x)}" y2="${Y(g.p1.y)}" stroke="#ffffff" stroke-width="${f2(t + 1)}"/>`);
    if (o.kind === "door") {
      const leafX = g.p0.x + g.normal.x * o.width;
      const leafY = g.p0.y + g.normal.y * o.width;
      const r = o.width * s;
      out.push(`<line x1="${X(g.p0.x)}" y1="${Y(g.p0.y)}" x2="${X(leafX)}" y2="${Y(leafY)}" stroke="#2b2f3a" stroke-width="1.2"/>`);
      out.push(`<path d="M ${X(leafX)} ${Y(leafY)} A ${f2(r)} ${f2(r)} 0 0 1 ${X(g.p1.x)} ${Y(g.p1.y)}" fill="none" stroke="#2b2f3a" stroke-width="0.6"/>`);
    } else {
      for (const k of [-0.5, 0, 0.5]) {
        const dx = g.normal.x * (t / 2) * k;
        const dy = g.normal.y * (t / 2) * k;
        out.push(`<line x1="${f2(X(g.p0.x) + dx)}" y1="${f2(Y(g.p0.y) + dy)}" x2="${f2(X(g.p1.x) + dx)}" y2="${f2(Y(g.p1.y) + dy)}" stroke="#2b6cb0" stroke-width="1"/>`);
      }
    }
  }

  if (p.detail) out.push(detailSvg(p, floor, Math.max(0, p.floors.indexOf(floor)), X, Y, s, 1, X(vx) - 58, Y(vy) - 58));

  for (const r of floor.rooms.filter(isValidRect)) {
    const cx = X(r.x + r.width / 2);
    const cy = Y(r.y + r.depth / 2);
    const fs = Math.max(8, Math.min(13, (r.width * s) / 9));
    out.push(
      `<text x="${cx}" y="${f2(cy - fs * 0.6)}" font-size="${f2(fs)}" font-weight="bold" text-anchor="middle" fill="#1f2430">${esc(r.name)}</text>` +
        `<text x="${cx}" y="${f2(cy + fs * 0.6)}" font-size="${f2(fs * 0.85)}" text-anchor="middle" fill="#3b4252">${esc(formatLength(r.width, sys))} x ${esc(formatLength(r.depth, sys))}</text>` +
        `<text x="${cx}" y="${f2(cy + fs * 1.8)}" font-size="${f2(fs * 0.85)}" text-anchor="middle" fill="#3b4252">${esc(formatArea(r.width * r.depth, sys))}</text>`,
    );
  }

  for (const d of floor.dimensions) out.push(dimension(X(d.x1), Y(d.y1), X(d.x2), Y(d.y2), -14, formatLength(Math.hypot(d.x2 - d.x1, d.y2 - d.y1), sys)));
  out.push(dimension(X(vx), Y(vy), X(vx + vw), Y(vy), -34, cropped ? `Area shown ${formatLength(vw, sys)}` : `Plot width ${formatLength(p.plot.width, sys)}`));
  out.push(dimension(X(vx), Y(vy), X(vx), Y(vy + vd), 34, cropped ? `Area shown ${formatLength(vd, sys)}` : `Plot depth ${formatLength(p.plot.depth, sys)}`));

  // north arrow (top-right of the plot)
  {
    const na = p.northAngle ?? 0;
    const cx = X(vx + vw) + 30;
    const cy = Y(vy) + 30;
    out.push(
      `<g transform="translate(${f2(cx)} ${f2(cy)}) rotate(${f2(na)})"><circle r="18" fill="#ffffff" stroke="#1f2430" stroke-width="1"/>` +
        `<polygon points="0,-15 6,8 0,4 -6,8" fill="#1f2430"/><text y="-21" font-size="11" font-weight="bold" text-anchor="middle" fill="#1f2430">N</text></g>`,
    );
  }

  // scale bar
  const bar = niceScaleBar(plotMax, sys);
  const bx = X(0);
  const by = Y(vy + vd) + 30;
  out.push(
    `<g stroke="#1f2430" stroke-width="1.5"><line x1="${bx}" y1="${by}" x2="${f2(bx + bar.meters * s)}" y2="${by}"/><line x1="${bx}" y1="${by - 4}" x2="${bx}" y2="${by + 4}"/><line x1="${f2(bx + bar.meters * s)}" y1="${by - 4}" x2="${f2(bx + bar.meters * s)}" y2="${by + 4}"/></g>` +
      `<text x="${f2(bx + (bar.meters * s) / 2)}" y="${by + 16}" font-size="10" text-anchor="middle" fill="#1f2430">${esc(bar.label)}</text>`,
  );

  if (showTitle) {
    const ty = H - titleH + 14;
    const total = floor.rooms.filter(isValidRect).reduce((a, r) => a + r.width * r.depth, 0);
    out.push(`<rect x="10" y="${ty}" width="${f2(W - 20)}" height="${titleH - 24}" fill="none" stroke="#1f2430" stroke-width="1"/>`);
    const line = (i: number, text: string, bold = false) =>
      `<text x="22" y="${ty + 20 + i * 16}" font-size="${bold ? 14 : 11}" ${bold ? 'font-weight="bold"' : ""} fill="#1f2430">${esc(text)}</text>`;
    out.push(line(0, `${p.name} - ${floor.name}`, true));
    out.push(`<text x="${f2(W - 22)}" y="${ty + 20}" font-size="12" font-weight="bold" text-anchor="end" fill="#178263">${esc(BRAND.product)}</text>`);
    out.push(`<text x="${f2(W - 22)}" y="${ty + 36}" font-size="10" text-anchor="end" fill="#434b5f">${esc(BRAND.credit)}</text>`);
    out.push(line(1, `Plot ${formatLength(p.plot.width, sys)} x ${formatLength(p.plot.depth, sys)} (${formatPlotArea(plotArea(p.plot))})${cropped ? " - drawing cropped around the building" : ""}`));
    out.push(line(2, `Rooms on this floor: ${floor.rooms.length}, total room area ${formatArea(total, sys)} - Units: ${sys}`));
    out.push(line(3, `Date: ${new Date().toISOString().slice(0, 10)} - Drawing: dimensioned floor plan (conceptual)`));
    out.push(`<text x="22" y="${ty + 20 + 4 * 16 + 2}" font-size="9" fill="#a02020">${esc(DISCLAIMER_SHORT)}</text>`);
  }

  out.push(`</svg>`);
  return out.join("\n");
}

export const roomLabel = (type: keyof typeof ROOM_TYPE_LABELS) => ROOM_TYPE_LABELS[type];
