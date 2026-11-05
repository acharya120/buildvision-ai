import type { Rect } from "./rect";

type Side = "top" | "bottom" | "left" | "right";

/** Triangles (x,y,z per vertex, y up, plan-y mapped to z) of a four-sided hip roof over a rectangle. */
export function hipRoofPositions(r: Rect, baseY: number, overhang = 0.4): { positions: Float32Array; rise: number } {
  const x0 = r.x - overhang, x1 = r.x + r.width + overhang, y0 = r.y - overhang, y1 = r.y + r.depth + overhang;
  const w = x1 - x0, d = y1 - y0;
  const rise = Math.min(3, Math.max(0.8, Math.min(w, d) * 0.25));
  const top = baseY + rise;
  const v: number[] = [];
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => v.push(...a, ...b, ...c);
  const A: [number, number, number] = [x0, baseY, y0];
  const B: [number, number, number] = [x1, baseY, y0];
  const C: [number, number, number] = [x1, baseY, y1];
  const D: [number, number, number] = [x0, baseY, y1];
  const cx = (x0 + x1) / 2, cz = (y0 + y1) / 2;
  if (w >= d) {
    const inset = d / 2;
    const R1: [number, number, number] = [x0 + inset, top, cz];
    const R2: [number, number, number] = [x1 - inset, top, cz];
    tri(A, B, R2); tri(A, R2, R1);
    tri(B, C, R2);
    tri(C, D, R1); tri(C, R1, R2);
    tri(D, A, R1);
  } else {
    const inset = w / 2;
    const R1: [number, number, number] = [cx, top, y0 + inset];
    const R2: [number, number, number] = [cx, top, y1 - inset];
    tri(A, D, R2); tri(A, R2, R1);
    tri(B, C, R2); tri(B, R2, R1);
    tri(A, B, R1);
    tri(D, C, R2);
  }
  return { positions: new Float32Array(v), rise };
}

/** Share of the bounding box covered by the rooms (1 = a perfect rectangle). */
export function footprintFill(rooms: Rect[]): { box: Rect; fill: number } | null {
  if (!rooms.length) return null;
  const x0 = Math.min(...rooms.map((r) => r.x)), y0 = Math.min(...rooms.map((r) => r.y));
  const x1 = Math.max(...rooms.map((r) => r.x + r.width)), y1 = Math.max(...rooms.map((r) => r.y + r.depth));
  const area = rooms.reduce((a, r) => a + r.width * r.depth, 0);
  const box = { x: x0, y: y0, width: x1 - x0, depth: y1 - y0 };
  return { box, fill: area / Math.max(1e-9, box.width * box.depth) };
}

export interface Shrub {
  x: number;
  z: number;
  r: number;
  tone: number;
  /** index into a small flower palette, or null */
  flower: number | null;
}

/** Hedge and flower-bed bushes planted just inside the boundary wall. Deterministic, capped in count. */
export function shrubPositions(wall: Rect[], plot: { width: number; depth: number }, spacing = 1.1, inset = 0.55, max = 260): Shrub[] {
  const total = wall.reduce((a, r) => a + Math.max(r.width, r.depth), 0);
  const step = Math.max(spacing, (total / Math.max(1, max)) * 1.3);
  const out: Shrub[] = [];
  let i = 0;
  for (const r of wall) {
    const horiz = r.width >= r.depth;
    const len = horiz ? r.width : r.depth;
    const mid = horiz ? r.y + r.depth / 2 : r.x + r.width / 2;
    const centre = horiz ? plot.depth / 2 : plot.width / 2;
    const sign = centre >= mid ? 1 : -1;
    const off = mid + sign * ((horiz ? r.depth : r.width) / 2 + inset);
    for (let t = 0.35; t <= len - 0.35 + 1e-9; t += step) {
      const a = (horiz ? r.x : r.y) + t;
      out.push({ x: horiz ? a : off, z: horiz ? off : a, r: 0.28 + ((i * 37) % 5) * 0.04, tone: i % 3, flower: i % 3 === 0 ? i % 4 : null });
      i++;
    }
  }
  return out;
}

/** Posts along the boundary wall: both ends of every piece plus evenly spaced ones between. */
export function pillarPositions(wall: Rect[], spacing = 3.6, max = 160): Array<{ x: number; z: number }> {
  const total = wall.reduce((a, r) => a + Math.max(r.width, r.depth), 0);
  const step = Math.max(spacing, total / Math.max(1, max));
  const seen = new Set<string>();
  const out: Array<{ x: number; z: number }> = [];
  const add = (x: number, z: number) => {
    const k = `${Math.round(x * 4)}:${Math.round(z * 4)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, z });
  };
  for (const r of wall) {
    const horiz = r.width >= r.depth;
    const len = horiz ? r.width : r.depth;
    const n = Math.max(1, Math.round(len / step));
    for (let j = 0; j <= n; j++) {
      const a = (horiz ? r.x : r.y) + (len * j) / n;
      add(horiz ? a : r.x + r.width / 2, horiz ? r.y + r.depth / 2 : a);
    }
  }
  return out;
}

export interface RoadModel {
  pave: { cx: number; cz: number; w: number; d: number };
  road: { cx: number; cz: number; w: number; d: number };
  dashes: Array<{ x: number; z: number; w: number; d: number }>;
}

/** A pavement and a two-way road running along one edge of the plot, outside it. */
export function roadAlong(side: Side, plot: { width: number; depth: number }, extra: number, roadWidth = 7, paveWidth = 1.6, edgeAt?: number): RoadModel {
  const horiz = side === "top" || side === "bottom";
  const length = (horiz ? plot.width : plot.depth) + extra * 2;
  const centreAlong = horiz ? plot.width / 2 : plot.depth / 2;
  const sign = side === "bottom" || side === "right" ? 1 : -1;
  const edge = edgeAt ?? (side === "bottom" ? plot.depth : side === "right" ? plot.width : 0);
  const paveC = edge + sign * (paveWidth / 2);
  const roadC = edge + sign * (paveWidth + roadWidth / 2);
  const box = (c: number, across: number) => (horiz ? { cx: centreAlong, cz: c, w: length, d: across } : { cx: c, cz: centreAlong, w: across, d: length });
  const dashLen = 1.6;
  const count = Math.min(80, Math.floor(length / 3.2));
  const dashes: RoadModel["dashes"] = [];
  for (let i = 0; i < count; i++) {
    const a = centreAlong - length / 2 + ((i + 0.5) * length) / count;
    dashes.push(horiz ? { x: a, z: roadC, w: dashLen, d: 0.15 } : { x: roadC, z: a, w: 0.15, d: dashLen });
  }
  return { pave: box(paveC, paveWidth), road: box(roadC, roadWidth), dashes };
}

export interface WallSeg { x1: number; y1: number; x2: number; y2: number }

/** Boundary wall pieces along a shaped plot: centre, length and rotation about the vertical axis. */
export function segPieces(segs: WallSeg[]): Array<{ cx: number; cz: number; len: number; angle: number }> {
  return segs.map((s) => ({ cx: (s.x1 + s.x2) / 2, cz: (s.y1 + s.y2) / 2, len: Math.hypot(s.x2 - s.x1, s.y2 - s.y1), angle: -Math.atan2(s.y2 - s.y1, s.x2 - s.x1) }));
}

/** Posts at the corners and evenly along every piece of a shaped boundary wall. */
export function segPillars(segs: WallSeg[], spacing = 3.6, max = 160): Array<{ x: number; z: number }> {
  const total = segs.reduce((a, q) => a + Math.hypot(q.x2 - q.x1, q.y2 - q.y1), 0);
  const step = Math.max(spacing, total / Math.max(1, max));
  const out: Array<{ x: number; z: number }> = [];
  for (const q of segs) {
    const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
    const n = Math.max(1, Math.round(len / step));
    for (let j = 0; j < n; j++) out.push({ x: q.x1 + ((q.x2 - q.x1) * j) / n, z: q.y1 + ((q.y2 - q.y1) * j) / n });
  }
  return out;
}

/** Bushes just inside a shaped boundary (centre of the plot decides which side is inside). */
export function segShrubs(segs: WallSeg[], centre: { x: number; y: number }, spacing = 1.1, inset = 0.55, max = 260): Shrub[] {
  const total = segs.reduce((a, q) => a + Math.hypot(q.x2 - q.x1, q.y2 - q.y1), 0);
  const step = Math.max(spacing, (total / Math.max(1, max)) * 1.3);
  const out: Shrub[] = [];
  let i = 0;
  for (const q of segs) {
    const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
    if (len < 0.7) continue;
    const ux = (q.x2 - q.x1) / len, uy = (q.y2 - q.y1) / len;
    let nx = -uy, ny = ux;
    if (nx * (centre.x - q.x1) + ny * (centre.y - q.y1) < 0) { nx = -nx; ny = -ny; }
    for (let t = 0.35; t <= len - 0.35 + 1e-9; t += step) {
      out.push({ x: q.x1 + ux * t + nx * inset, z: q.y1 + uy * t + ny * inset, r: 0.28 + ((i * 37) % 5) * 0.04, tone: i % 3, flower: i % 3 === 0 ? i % 4 : null });
      i++;
    }
  }
  return out;
}
