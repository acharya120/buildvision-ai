import type { LoadOptions, Project } from "../model/types";
import { buildStructure, letterLabel } from "./structure";
import { floorBuiltUp } from "./areas";

/**
 * INDICATIVE load distribution on the columns of the indicative structure (see structure.ts).
 * Slab load is shared between columns by tributary (grid) area, wall load by the beams that meet at each column,
 * and each floor's total is carried down to the nearest column below. It is a simple hand-calculation style
 * estimate for explaining how load travels: it is NOT a structural design or check and ignores wind, seismic,
 * load factors, continuity, openings, stairs and soil. A structural engineer must design the real structure.
 */
export const CONCRETE_WEIGHT = 25; // kN/m3, reinforced concrete

export interface ColumnLoad {
  x: number;
  y: number;
  /** grid reference like "B-3" (letter = horizontal line, number = vertical line) */
  ref: string;
  /** load arriving from this floor's slab, walls and the column's own weight, kN (service) */
  own: number;
  /** own + everything carried down from the floors above, kN (service) */
  total: number;
}
export interface FloorLoads {
  name: string;
  columns: ColumnLoad[];
  /** total service load of this floor (slab + walls + column weight), kN */
  floorTotal: number;
}
export interface FootingCheck {
  ref: string;
  load: number;
  /** soil pressure under the footing size you entered, kN/m2 */
  pressure: number;
  /** side of a square footing that would bring pressure down to the bearing value, m */
  neededSide: number;
  ok: boolean;
}
export interface LoadResult {
  floors: FloorLoads[];
  footings: FootingCheck[];
  /** sum of all service loads reaching the ground, kN */
  totalToGround: number;
}

function nearestIndex(list: Array<{ x: number; y: number }>, x: number, y: number): number {
  let best = -1;
  let bd = Infinity;
  list.forEach((c, i) => {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export function computeLoads(p: Project): LoadResult | null {
  const d = p.detail;
  const o: LoadOptions | undefined = d?.loads;
  if (!d || !o) return null;
  const top = p.floors.length - 1;
  const floors: FloorLoads[] = [];

  p.floors.forEach((f, fi) => {
    const st = buildStructure(f, d.maxSpan);
    const cols = st.columns;
    if (!cols.length) {
      floors.push({ name: f.name, columns: [], floorTotal: 0 });
      return;
    }
    const gx = st.gridX.map((g) => g.pos);
    const gy = st.gridY.map((g) => g.pos);
    const idx = (arr: number[], v: number) => {
      let bi = 0;
      arr.forEach((a, i) => {
        if (Math.abs(a - v) < Math.abs(arr[bi] - v)) bi = i;
      });
      return bi;
    };
    const half = (arr: number[], i: number, v: number) => ((i < arr.length - 1 ? arr[i + 1] : v) - (i > 0 ? arr[i - 1] : v)) / 2;
    const trib = cols.map((c) => {
      const ix = idx(gx, c.x);
      const iy = idx(gy, c.y);
      return Math.max(0, half(gx, ix, c.x)) * Math.max(0, half(gy, iy, c.y));
    });
    const tribSum = trib.reduce((a, b) => a + b, 0) || 1;

    // slab load: the whole floor's slab load, shared by tributary area so no load is lost or invented
    const area = floorBuiltUp(f, p.settings.exteriorWallThickness);
    const w = CONCRETE_WEIGHT * o.slabThickness + o.finishDead + (fi === top ? o.roofLoad : o.liveLoad);
    const slabTotal = area * w;

    // wall load: half of each beam's wall weight goes to each end column
    const wallLine = Math.max(0, f.height - d.beamDepth) * p.settings.exteriorWallThickness * o.wallWeight; // kN/m (outer-wall estimate)
    const innerLine = Math.max(0, f.height - d.beamDepth) * p.settings.defaultWallThickness * o.wallWeight;
    const wallLoad = cols.map(() => 0);
    for (const b of st.beams) {
      const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
      const mx = (b.x1 + b.x2) / 2;
      const my = (b.y1 + b.y2) / 2;
      const onEdge = st.bbox ? mx < st.bbox.x0 + 0.3 || mx > st.bbox.x1 - 0.3 || my < st.bbox.y0 + 0.3 || my > st.bbox.y1 - 0.3 : false;
      const q = (onEdge ? wallLine : innerLine) * len;
      for (const [x, y] of [[b.x1, b.y1], [b.x2, b.y2]] as const) wallLoad[nearestIndex(cols, x, y)] += q / 2;
    }
    const selfWeight = d.columnSize * d.columnSize * f.height * CONCRETE_WEIGHT;
    const columns: ColumnLoad[] = cols.map((c, i) => {
      const own = (trib[i] / tribSum) * slabTotal + wallLoad[i] + selfWeight;
      const ref = `${letterLabel(idx(gy, c.y))}-${idx(gx, c.x) + 1}`;
      return { x: c.x, y: c.y, ref, own, total: own };
    });
    floors.push({ name: f.name, columns, floorTotal: columns.reduce((a, c) => a + c.own, 0) });
  });

  // carry loads down: each column hands its total to the nearest column on the floor below
  for (let fi = top; fi > 0; fi--) {
    const below = floors[fi - 1].columns;
    if (!below.length) continue;
    for (const c of floors[fi].columns) below[nearestIndex(below, c.x, c.y)].total += c.total;
  }

  const ground = floors[0]?.columns ?? [];
  const footings: FootingCheck[] = ground.map((c) => {
    const pressure = c.total / (d.footingSize * d.footingSize);
    return { ref: c.ref, load: c.total, pressure, neededSide: Math.sqrt(c.total / o.bearing), ok: pressure <= o.bearing };
  });
  return { floors, footings, totalToGround: ground.reduce((a, c) => a + c.total, 0) };
}
