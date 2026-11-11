import type { Floor, Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { openingCentre } from "../review/roomEdges";
import { buildStructure } from "../structure/structure";
import { plumbingFloor } from "../analysis/services";
import { wallLength } from "../geometry/walls";

export type ClashSeverity = "high" | "medium" | "info";
export interface Clash { id: string; severity: ClashSeverity; between: string; floorName: string; message: string; x: number; y: number }

type Iv = [number, number];
function mergeIv(list: Iv[]): Iv[] {
  const s = [...list].sort((a, b) => a[0] - b[0]);
  const out: Iv[] = [];
  for (const iv of s) { const l = out[out.length - 1]; if (l && iv[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], iv[1]); else out.push([iv[0], iv[1]]); }
  return out;
}
export function subtractIv(a: Iv[], b: Iv[]): Iv[] {
  const bm = mergeIv(b);
  const out: Iv[] = [];
  for (const [s, e] of mergeIv(a)) {
    let cur = s;
    for (const [bs, be] of bm) {
      if (be <= cur || bs >= e) continue;
      if (bs > cur) out.push([cur, bs]);
      cur = Math.max(cur, be);
    }
    if (cur < e) out.push([cur, e]);
  }
  return out;
}
/** Wall coverage as intervals on horizontal (key "h:y") and vertical (key "v:x") lines, rounded to 0.1 m. */
export function wallLines(floor: Floor, grid = 0.1): Map<string, Iv[]> {
  const m = new Map<string, Iv[]>();
  const r = (v: number) => Math.round(v / grid) * grid;
  for (const w of floor.walls) {
    const h = Math.abs(w.y1 - w.y2) < 1e-6, v = Math.abs(w.x1 - w.x2) < 1e-6;
    if (!h && !v) continue;
    const key = h ? `h:${r(w.y1).toFixed(1)}` : `v:${r(w.x1).toFixed(1)}`;
    const iv: Iv = h ? [Math.min(w.x1, w.x2), Math.max(w.x1, w.x2)] : [Math.min(w.y1, w.y2), Math.max(w.y1, w.y2)];
    (m.get(key) ?? m.set(key, []).get(key)!).push(iv);
  }
  return m;
}
export function diffLines(a: Map<string, Iv[]>, b: Map<string, Iv[]>): Array<{ key: string; iv: Iv }> {
  const out: Array<{ key: string; iv: Iv }> = [];
  for (const [k, list] of a) for (const iv of subtractIv(list, b.get(k) ?? [])) if (iv[1] - iv[0] > 0.05) out.push({ key: k, iv });
  return out;
}
const lineMid = (k: string, iv: Iv) => (k[0] === "h" ? { x: (iv[0] + iv[1]) / 2, y: Number(k.slice(2)) } : { x: Number(k.slice(2)), y: (iv[0] + iv[1]) / 2 });

const HABITABLE = new Set(["bedroom", "master-bedroom", "living", "dining", "study", "office"]);
const WET = new Set(["bathroom", "toilet", "kitchen", "utility"]);

/**
 * Geometric clash detection between structure, openings, walls and services in your own model.
 * The structural grid is the app's INDICATIVE layout, so treat results as coordination prompts, not as an engineer's clash report.
 */
export function detectClashes(p: Project): Clash[] {
  const out: Clash[] = [];
  let n = 0;
  const add = (c: Omit<Clash, "id">) => out.push({ id: `k${++n}`, ...c });
  const colSize = p.detail?.columnSize ?? 0.23, beamDepth = p.detail?.beamDepth ?? 0.45, span = p.detail?.maxSpan ?? 4.5;

  p.floors.forEach((f, fi) => {
    const wallOf = new Map(f.walls.map((w) => [w.id, w]));
    // openings overlapping each other on the same wall
    const byWall = new Map<string, typeof f.openings>();
    for (const o of f.openings) (byWall.get(o.wallId) ?? byWall.set(o.wallId, []).get(o.wallId)!).push(o);
    for (const [wid, list] of byWall) {
      const w = wallOf.get(wid);
      if (!w) continue;
      const s = [...list].sort((a, b) => a.offset - b.offset);
      for (let i = 1; i < s.length; i++) if (s[i].offset < s[i - 1].offset + s[i - 1].width - 1e-6) { const c = openingCentre(w, s[i]); add({ severity: "high", between: "Opening × opening", floorName: f.name, message: `A ${s[i].kind} overlaps a ${s[i - 1].kind} on the same wall.`, x: c.x, y: c.y }); }
    }
    const st = buildStructure(f, span);
    // columns inside openings; beams low over windows
    for (const o of f.openings) {
      const w = wallOf.get(o.wallId);
      if (!w) continue;
      const len = wallLength(w) || 1;
      const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
      for (const c of st.columns) {
        const t = (c.x - w.x1) * ux + (c.y - w.y1) * uy;
        const dist = Math.abs(-(c.x - w.x1) * uy + (c.y - w.y1) * ux);
        if (dist <= w.thickness / 2 + colSize / 2 && t + colSize / 2 > o.offset && t - colSize / 2 < o.offset + o.width) {
          add({ severity: "high", between: "Column × opening", floorName: f.name, message: `An indicative column falls inside a ${o.kind}. Shift the opening or the column.`, x: c.x, y: c.y });
        }
      }
      if (o.kind === "window" && o.sill + o.height > f.height - beamDepth + 1e-6) {
        for (const b of st.beams) {
          const bh = Math.abs(b.y1 - b.y2) < 1e-6, wh = Math.abs(w.y1 - w.y2) < 1e-6;
          if (bh !== wh) continue;
          const on = bh ? Math.abs(b.y1 - w.y1) < w.thickness : Math.abs(b.x1 - w.x1) < w.thickness;
          if (!on) continue;
          const c = openingCentre(w, o);
          const a = bh ? [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)] : [Math.min(b.y1, b.y2), Math.max(b.y1, b.y2)];
          const pos = bh ? c.x : c.y;
          if (pos > a[0] && pos < a[1]) { add({ severity: "medium", between: "Beam × window", floorName: f.name, message: `Window head (${(o.sill + o.height).toFixed(2)} m) is above the underside of the beam (${(f.height - beamDepth).toFixed(2)} m). Lower the head or reduce the beam depth.`, x: c.x, y: c.y }); break; }
        }
      }
    }
    // plumbing stack and pipe runs through the wrong rooms
    const pl = plumbingFloor(f);
    const inRoom = (x: number, y: number) => f.rooms.find((r) => isValidRect(r) && x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.depth);
    if (pl.stack) {
      const r = inRoom(pl.stack.x, pl.stack.y);
      if (r && HABITABLE.has(r.type)) add({ severity: "medium", between: "Plumbing × room", floorName: f.name, message: `The central drain stack would sit inside ${r.name || ROOM_TYPE_LABELS[r.type]}. Move the stack into a wet room or a shaft.`, x: pl.stack.x, y: pl.stack.y });
    }
    const seen = new Set<string>();
    for (const run of pl.runs.filter((q) => q.kind === "drain")) {
      const mx = (run.x1 + run.x2) / 2, my = (run.y1 + run.y2) / 2;
      const r = inRoom(mx, my);
      if (r && HABITABLE.has(r.type) && !seen.has(r.id)) { seen.add(r.id); add({ severity: "info", between: "Plumbing × room", floorName: f.name, message: `A drain run would cross ${r.name || ROOM_TYPE_LABELS[r.type]}. Route drains through walls, shafts or corridors.`, x: mx, y: my }); }
    }
    // support from the floor below
    if (fi > 0) {
      const below = p.floors[fi - 1];
      const belowLines = wallLines(below);
      for (const b of st.beams) {} // beams of the floor below are not modelled separately: walls and rooms are the support
      const unsupported = diffLines(wallLines(f), belowLines).filter((u) => u.iv[1] - u.iv[0] > 0.5);
      for (const u of unsupported) {
        const mid = lineMid(u.key, u.iv);
        add({ severity: "medium", between: "Wall × support", floorName: f.name, message: `About ${(u.iv[1] - u.iv[0]).toFixed(1)} m of wall has no wall under it on ${below.name}. It needs a beam or a revised layout.`, x: mid.x, y: mid.y });
      }
      // overhang
      for (const r of f.rooms.filter(isValidRect)) {
        let covered = 0;
        for (const q of below.rooms.filter(isValidRect)) { const w = Math.min(r.x + r.width, q.x + q.width) - Math.max(r.x, q.x), h = Math.min(r.y + r.depth, q.y + q.depth) - Math.max(r.y, q.y); if (w > 0 && h > 0) covered += w * h; }
        const over = r.width * r.depth - covered;
        if (over > 0.5 && r.type !== "balcony") add({ severity: "info", between: "Room × support", floorName: f.name, message: `${r.name || ROOM_TYPE_LABELS[r.type]} overhangs the floor below by about ${over.toFixed(1)} m². A cantilever or transfer beam is needed.`, x: r.x + r.width / 2, y: r.y + r.depth / 2 });
      }
      // wet room stacking
      for (const r of f.rooms.filter((q) => isValidRect(q) && (q.type === "bathroom" || q.type === "toilet"))) {
        const ok = below.rooms.some((q) => isValidRect(q) && WET.has(q.type) && Math.min(r.x + r.width, q.x + q.width) - Math.max(r.x, q.x) > 0.3 && Math.min(r.y + r.depth, q.y + q.depth) - Math.max(r.y, q.y) > 0.3);
        if (!ok) add({ severity: "info", between: "Plumbing × layout", floorName: f.name, message: `${r.name || ROOM_TYPE_LABELS[r.type]} is not above a wet room, so its drain must run through the ceiling below.`, x: r.x + r.width / 2, y: r.y + r.depth / 2 });
      }
    }
  });
  const rank = { high: 0, medium: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
