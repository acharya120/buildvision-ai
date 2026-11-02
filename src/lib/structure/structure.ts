import type { Floor, Wall } from "../model/types";

/**
 * INDICATIVE structural layout drawn from the walls: columns at wall corners and junctions, extra columns where a
 * wall run is longer than the span limit the user entered, beams along the walls between columns, and grid lines.
 * It is a drawing aid. It does NOT size or check anything; a structural engineer must design the real structure.
 */
export interface Column {
  x: number;
  y: number;
}
export interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface GridLine {
  axis: "x" | "y";
  pos: number;
  label: string;
}
export interface StructureModel {
  columns: Column[];
  beams: Beam[];
  /** vertical grid lines (constant x), numbered 1, 2, 3 ... from left to right */
  gridX: GridLine[];
  /** horizontal grid lines (constant y), lettered A, B, C ... from top to bottom */
  gridY: GridLine[];
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

const TOL = 0.15;
const GRID_TOL = 0.3;
/** inner columns closer than this to another column are left out, so small rooms do not get a forest of columns */
const MIN_INNER_GAP = 2.0;
const MAX_COLUMNS = 800;

type Dir = "W" | "E" | "N" | "S";
interface Seg {
  horiz: boolean;
  fixed: number; // y for horizontal, x for vertical
  a: number; // smaller coordinate along the wall
  b: number; // larger coordinate along the wall
  /** thick (outside) wall */
  ext: boolean;
}

function segs(walls: Wall[]): Seg[] {
  const out: Seg[] = [];
  for (const w of walls) {
    const dx = Math.abs(w.x2 - w.x1);
    const dy = Math.abs(w.y2 - w.y1);
    if (dy < 1e-3 && dx > 0.3) out.push({ horiz: true, fixed: (w.y1 + w.y2) / 2, a: Math.min(w.x1, w.x2), b: Math.max(w.x1, w.x2), ext: w.thickness >= 0.2 });
    else if (dx < 1e-3 && dy > 0.3) out.push({ horiz: false, fixed: (w.x1 + w.x2) / 2, a: Math.min(w.y1, w.y2), b: Math.max(w.y1, w.y2), ext: w.thickness >= 0.2 });
  }
  return out;
}

/** 1 -> A, 26 -> Z, 27 -> AA ... (index is zero based) */
export function letterLabel(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  let group: number[] = [];
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > tol) {
      out.push(group.reduce((x, y) => x + y, 0) / group.length);
      group = [];
    }
    group.push(v);
  }
  if (group.length) out.push(group.reduce((x, y) => x + y, 0) / group.length);
  return out;
}

export function buildStructure(floor: Floor, maxSpan: number): StructureModel {
  const S = segs(floor.walls);
  if (!S.length) return { columns: [], beams: [], gridX: [], gridY: [], bbox: null };

  // candidate points: wall ends and crossings of horizontal and vertical walls
  const cand: Array<{ x: number; y: number }> = [];
  for (const s of S) {
    cand.push(s.horiz ? { x: s.a, y: s.fixed } : { x: s.fixed, y: s.a });
    cand.push(s.horiz ? { x: s.b, y: s.fixed } : { x: s.fixed, y: s.b });
  }
  for (const h of S.filter((s) => s.horiz))
    for (const v of S.filter((s) => !s.horiz)) {
      if (v.fixed >= h.a - TOL && v.fixed <= h.b + TOL && h.fixed >= v.a - TOL && h.fixed <= v.b + TOL) cand.push({ x: v.fixed, y: h.fixed });
    }
  // merge nearby candidates
  const pts: Array<{ x: number; y: number; n: number }> = [];
  for (const c of cand) {
    const hit = pts.find((p) => Math.abs(p.x - c.x) <= TOL && Math.abs(p.y - c.y) <= TOL);
    if (hit) {
      hit.x = (hit.x * hit.n + c.x) / (hit.n + 1);
      hit.y = (hit.y * hit.n + c.y) / (hit.n + 1);
      hit.n++;
    } else pts.push({ ...c, n: 1 });
  }

  // a column stands where walls meet as a corner (two perpendicular arms) or a T / cross (three or more arms)
  const found: Array<Column & { ext: boolean }> = [];
  for (const p of pts) {
    const dirs = new Set<Dir>();
    let ext = false;
    for (const s of S) {
      if (s.horiz) {
        if (Math.abs(s.fixed - p.y) > TOL || p.x < s.a - TOL || p.x > s.b + TOL) continue;
        ext = ext || s.ext;
        if (p.x - s.a > TOL) dirs.add("W");
        if (s.b - p.x > TOL) dirs.add("E");
      } else {
        if (Math.abs(s.fixed - p.x) > TOL || p.y < s.a - TOL || p.y > s.b + TOL) continue;
        ext = ext || s.ext;
        if (p.y - s.a > TOL) dirs.add("N");
        if (s.b - p.y > TOL) dirs.add("S");
      }
    }
    const horizArm = dirs.has("W") || dirs.has("E");
    const vertArm = dirs.has("N") || dirs.has("S");
    if (dirs.size >= 3 || (dirs.size === 2 && horizArm && vertArm)) found.push({ x: p.x, y: p.y, ext });
  }
  // keep every column on an outside wall; keep inner ones only when they are not crowding another column
  const columns: Column[] = found.filter((c) => c.ext).map((c) => ({ x: c.x, y: c.y }));
  for (const c of found.filter((q) => !q.ext)) {
    if (columns.every((k) => Math.hypot(k.x - c.x, k.y - c.y) >= MIN_INNER_GAP)) columns.push({ x: c.x, y: c.y });
  }

  // extra columns where a wall run between two columns is longer than the span limit
  const span = Number.isFinite(maxSpan) && maxSpan >= 1 ? maxSpan : 4.5;
  const onSeg = (s: Seg, c: Column) => (s.horiz ? Math.abs(c.y - s.fixed) <= TOL && c.x >= s.a - TOL && c.x <= s.b + TOL : Math.abs(c.x - s.fixed) <= TOL && c.y >= s.a - TOL && c.y <= s.b + TOL);
  const alongOf = (s: Seg, c: Column) => (s.horiz ? c.x : c.y);
  for (const s of S) {
    if (columns.length >= MAX_COLUMNS) break;
    const on = columns.filter((c) => onSeg(s, c)).sort((p, q) => alongOf(s, p) - alongOf(s, q));
    for (let i = 0; i + 1 < on.length; i++) {
      const g = alongOf(s, on[i + 1]) - alongOf(s, on[i]);
      if (g > span + 1e-6) {
        const n = Math.ceil(g / span);
        for (let k = 1; k < n; k++) {
          const t = alongOf(s, on[i]) + (g * k) / n;
          columns.push(s.horiz ? { x: t, y: s.fixed } : { x: s.fixed, y: t });
        }
      }
    }
  }

  // beams: between consecutive columns along every wall (de-duplicated where walls overlap)
  const beams: Beam[] = [];
  const seen = new Set<string>();
  for (const s of S) {
    const on = columns.filter((c) => onSeg(s, c)).sort((p, q) => alongOf(s, p) - alongOf(s, q));
    for (let i = 0; i + 1 < on.length; i++) {
      const A = on[i];
      const B = on[i + 1];
      if (Math.hypot(B.x - A.x, B.y - A.y) < 0.3) continue;
      const key = [A.x, A.y, B.x, B.y].map((v) => Math.round(v * 20)).join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      beams.push({ x1: A.x, y1: A.y, x2: B.x, y2: B.y });
    }
  }

  const xs = cluster(columns.map((c) => c.x), GRID_TOL);
  const ys = cluster(columns.map((c) => c.y), GRID_TOL);
  const gridX = xs.map((pos, i) => ({ axis: "x" as const, pos, label: String(i + 1) }));
  const gridY = ys.map((pos, i) => ({ axis: "y" as const, pos, label: letterLabel(i) }));
  const bbox = columns.length
    ? { x0: Math.min(...columns.map((c) => c.x)), y0: Math.min(...columns.map((c) => c.y)), x1: Math.max(...columns.map((c) => c.x)), y1: Math.max(...columns.map((c) => c.y)) }
    : null;
  return { columns, beams, gridX, gridY, bbox };
}
