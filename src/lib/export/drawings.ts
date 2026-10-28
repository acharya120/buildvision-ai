import type { Project } from "../model/types";
import { boundingBox, isValidRect } from "../geometry/rect";
import { wallLength } from "../geometry/walls";
import { formatLength } from "../model/units";
import { esc } from "./svg";
import { DISCLAIMER_SHORT } from "./disclaimer";

export type Side = "south" | "north" | "east" | "west";

export interface DrawRect {
  h0: number; // horizontal extent in the drawing, m
  h1: number;
  z0: number; // vertical extent, m above ground floor level
  z1: number;
  kind: "wall" | "door" | "window" | "slab" | "room" | "cut-wall";
  label?: string;
}

export interface Drawing {
  title: string;
  width: number; // m
  height: number; // m
  rects: DrawRect[];
}

export const floorElevations = (p: Project): number[] => {
  const out: number[] = [];
  let z = 0;
  for (const f of p.floors) {
    out.push(z);
    z += f.height;
  }
  return out;
};

const toH = (side: Side, p: Project, x: number, y: number): number =>
  side === "south" ? x : side === "north" ? p.plot.width - x : side === "east" ? p.plot.depth - y : y;

/**
 * Basic elevation: per floor, the footprint's bounding box seen from one side, plus the doors and
 * windows that sit on walls lying on that side of the floor's footprint. Simplified - no roof,
 * sills, projections or materials.
 */
export function buildElevation(p: Project, side: Side): Drawing {
  const elev = floorElevations(p);
  const rects: DrawRect[] = [];
  const horizontalSpan = side === "south" || side === "north" ? p.plot.width : p.plot.depth;
  const total = p.floors.reduce((s, f) => s + f.height, 0);

  p.floors.forEach((f, i) => {
    const bb = boundingBox(f.rooms);
    if (!bb) return;
    const x1 = bb.x;
    const x2 = bb.x + bb.width;
    const y1 = bb.y;
    const y2 = bb.y + bb.depth;
    const a = toH(side, p, side === "south" || side === "north" ? x1 : 0, side === "east" || side === "west" ? y1 : 0);
    const b = toH(side, p, side === "south" || side === "north" ? x2 : 0, side === "east" || side === "west" ? y2 : 0);
    rects.push({ h0: Math.min(a, b), h1: Math.max(a, b), z0: elev[i], z1: elev[i] + f.height, kind: "wall", label: f.name });

    const edge = side === "south" ? y2 : side === "north" ? y1 : side === "east" ? x2 : x1;
    const horizontalFacade = side === "south" || side === "north";
    for (const w of f.walls) {
      const onFacade = horizontalFacade
        ? Math.abs(w.y1 - edge) < 0.05 && Math.abs(w.y2 - edge) < 0.05
        : Math.abs(w.x1 - edge) < 0.05 && Math.abs(w.x2 - edge) < 0.05;
      if (!onFacade) continue;
      for (const o of f.openings.filter((q) => q.wallId === w.id)) {
        const len = wallLength(w);
        if (len <= 0) continue;
        const ux = (w.x2 - w.x1) / len;
        const uy = (w.y2 - w.y1) / len;
        const sx = w.x1 + ux * o.offset;
        const sy = w.y1 + uy * o.offset;
        const ex = sx + ux * o.width;
        const ey = sy + uy * o.width;
        const h0 = toH(side, p, sx, sy);
        const h1 = toH(side, p, ex, ey);
        rects.push({
          h0: Math.min(h0, h1),
          h1: Math.max(h0, h1),
          z0: elev[i] + o.sill,
          z1: elev[i] + o.sill + o.height,
          kind: o.kind,
        });
      }
    }
  });
  return { title: `${side[0].toUpperCase()}${side.slice(1)} elevation`, width: horizontalSpan, height: total, rects };
}

/**
 * Basic section: a cut through the building along a line of constant y (axis "y") or constant x
 * (axis "x"). Shows slabs, the rooms the cut passes through and the walls it slices.
 */
export function buildSection(p: Project, axis: "x" | "y", at: number): Drawing {
  const elev = floorElevations(p);
  const rects: DrawRect[] = [];
  const span = axis === "y" ? p.plot.width : p.plot.depth;
  const total = p.floors.reduce((s, f) => s + f.height, 0);
  p.floors.forEach((f, i) => {
    for (const r of f.rooms.filter(isValidRect)) {
      const a = axis === "y" ? r.y : r.x;
      const b = axis === "y" ? r.y + r.depth : r.x + r.width;
      if (at < a || at > b) continue;
      const h0 = axis === "y" ? r.x : r.y;
      const h1 = axis === "y" ? r.x + r.width : r.y + r.depth;
      rects.push({ h0, h1, z0: elev[i], z1: elev[i] + f.height, kind: "room", label: r.name });
      rects.push({ h0, h1, z0: elev[i] - 0.125, z1: elev[i], kind: "slab" });
    }
    for (const w of f.walls) {
      // walls running perpendicular to the cut line are sliced by it
      const perpendicular = axis === "y" ? Math.abs(w.x1 - w.x2) < 1e-6 : Math.abs(w.y1 - w.y2) < 1e-6;
      if (!perpendicular) continue;
      const lo = axis === "y" ? Math.min(w.y1, w.y2) : Math.min(w.x1, w.x2);
      const hi = axis === "y" ? Math.max(w.y1, w.y2) : Math.max(w.x1, w.x2);
      if (at < lo || at > hi) continue;
      const pos = axis === "y" ? w.x1 : w.y1;
      rects.push({ h0: pos - w.thickness / 2, h1: pos + w.thickness / 2, z0: elev[i], z1: elev[i] + f.height, kind: "cut-wall" });
    }
  });
  return {
    title: `Section ${axis === "y" ? "at y" : "at x"} = ${at.toFixed(2)} m`,
    width: span,
    height: total,
    rects,
  };
}

const FILL: Record<DrawRect["kind"], string> = {
  wall: "#efe7da",
  door: "#8a5a2b",
  window: "#9cc9ee",
  slab: "#555b69",
  room: "#e6edf7",
  "cut-wall": "#2b2f3a",
};

export function drawingToSvg(d: Drawing, p: Project): string {
  const margin = 50;
  const s = Math.min(60, 640 / Math.max(d.width, d.height * 1.2, 1));
  const W = Math.max(d.width * s + margin * 2, 760);
  const H = d.height * s + margin * 2 + 40;
  const X = (m: number) => Math.round((margin + m * s) * 100) / 100;
  const Y = (z: number) => Math.round((margin + (d.height - z) * s) * 100) / 100;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" font-family="Arial, Helvetica, sans-serif">`);
  out.push(`<rect width="100%" height="100%" fill="#fff"/>`);
  out.push(`<line x1="${X(0) - 20}" y1="${Y(0)}" x2="${X(d.width) + 20}" y2="${Y(0)}" stroke="#555" stroke-width="1.5"/>`);
  const order: DrawRect["kind"][] = ["room", "wall", "slab", "cut-wall", "window", "door"];
  for (const kind of order) {
    for (const r of d.rects.filter((q) => q.kind === kind)) {
      const stroke = kind === "room" || kind === "wall" ? "#6b7280" : "#1f2430";
      out.push(`<rect x="${X(r.h0)}" y="${Y(r.z1)}" width="${Math.max(0.8, Math.round((r.h1 - r.h0) * s * 100) / 100)}" height="${Math.max(0.8, Math.round((r.z1 - r.z0) * s * 100) / 100)}" fill="${FILL[kind]}" stroke="${stroke}" stroke-width="0.7"/>`);
      if (r.label && kind === "room") out.push(`<text x="${X((r.h0 + r.h1) / 2)}" y="${Y((r.z0 + r.z1) / 2)}" font-size="10" text-anchor="middle" fill="#1f2430">${esc(r.label)}</text>`);
    }
  }
  out.push(`<text x="${margin}" y="${H - 22}" font-size="12" font-weight="bold" fill="#1f2430">${esc(p.name)} - ${esc(d.title)} (${esc(formatLength(d.width, p.unitSystem))} wide, ${esc(formatLength(d.height, p.unitSystem))} high)</text>`);
  out.push(`<text x="${margin}" y="${H - 8}" font-size="9" fill="#a02020">${esc(DISCLAIMER_SHORT)} Simplified geometry: no roof, materials or structure.</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}
