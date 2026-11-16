/**
 * Lock and regenerate: keep the rooms you locked exactly where they are, and rearrange the unlocked rooms of ONE floor in the
 * space that is left (the floor's outline minus the locked rooms). Pure geometry: no UI. Deterministic (fixed seed).
 * Unlocked rooms keep their names, types and ids; their positions and sizes change. Doors and windows of the floor are re-planned.
 * Preliminary concept only.
 */
import type { Project, Room } from "../../model/types";
import { roundMm, rectArea } from "../../geometry/rect";
import { generateWalls, addOpeningOnWall, mapFloor } from "../../model/ops";
import { projectOnWall, wallLength } from "../../geometry/walls";
import { planOpenings, snap, sum, type OpeningSpec } from "../autodesign";
import { scoreAdjacency, DEFAULT_ADJACENCY, type AdjacencyWeights } from "./adjacency";
import { checkCirculation, SHAPE_RULES } from "./circulation";
import { daylightScore } from "./objectives";

export interface RegenOption {
  id: string;
  label: string;
  summary: string;
  score: number;
  /** full room list for the floor in plot coordinates (locked rooms unchanged) */
  rooms: Room[];
  openings: OpeningSpec[];
  notes: string[];
}
export interface RegenResult { options: RegenOption[]; errors: string[]; lockedCount: number; unlockedCount: number }
export interface RegenInput {
  frontSide?: "bottom" | "top";
  northAngle?: number;
  weights?: AdjacencyWeights;
  /** how many random arrangements to try (default 1500) */
  attempts?: number;
}

interface Rect { x: number; y: number; width: number; depth: number }
const EPS = 1e-6;

/** Free rectangles: `outline` minus the locked rectangles, cut into horizontal slabs and merged where they line up. */
export function freeRects(outline: Rect, locked: Rect[]): Rect[] {
  const x0 = outline.x, x1 = outline.x + outline.width, y0 = outline.y, y1 = outline.y + outline.depth;
  const ys = [y0, y1];
  for (const r of locked) for (const y of [r.y, r.y + r.depth]) if (y > y0 + EPS && y < y1 - EPS) ys.push(y);
  const levels = [...new Set(ys.map(roundMm))].sort((a, b) => a - b);
  let open: Rect[] = [];
  const done: Rect[] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const ya = levels[i], yb = levels[i + 1];
    const blockers = locked.filter((r) => r.y < yb - EPS && r.y + r.depth > ya + EPS).map((r) => [Math.max(x0, r.x), Math.min(x1, r.x + r.width)] as const).sort((a, b) => a[0] - b[0]);
    const slab: Rect[] = [];
    let cx = x0;
    for (const [bx0, bx1] of blockers) {
      if (bx0 > cx + 0.05) slab.push({ x: roundMm(cx), y: ya, width: roundMm(bx0 - cx), depth: roundMm(yb - ya) });
      cx = Math.max(cx, bx1);
    }
    if (x1 > cx + 0.05) slab.push({ x: roundMm(cx), y: ya, width: roundMm(x1 - cx), depth: roundMm(yb - ya) });
    const next: Rect[] = [];
    for (const s of slab) {
      const m = open.find((o) => Math.abs(o.x - s.x) < 1e-3 && Math.abs(o.width - s.width) < 1e-3 && Math.abs(o.y + o.depth - s.y) < 1e-3);
      if (m) { m.depth = roundMm(m.depth + s.depth); next.push(m); open = open.filter((o) => o !== m); }
      else next.push({ ...s });
    }
    done.push(...open);
    open = next;
  }
  done.push(...open);
  return done;
}

const mulberry = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = <T,>(a: T[], rnd: () => number): T[] => { const o = [...a]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };

const shapeOk = (t: Room["type"], w: number, d: number): boolean => {
  const r = SHAPE_RULES[t];
  if (!r) return Math.min(w, d) >= 0.9;
  const s = Math.min(w, d), l = Math.max(w, d);
  return s >= r.minShort - 1e-6 && l / s <= r.maxRatio + 1e-6;
};

/**
 * Fill one free rectangle with rooms by repeated straight cuts (a "guillotine" partition): the list is split in two groups,
 * the rectangle is cut across its longer side in proportion to the groups' target areas, and each half is filled the same way.
 * `pick` chooses where to split and which way to cut; it is driven by the seeded random generator so the search is deterministic.
 */
function guillotine(rect: Rect, rooms: Room[], targets: number[], pick: (n: number) => { split: number; flip: boolean }): Room[] | null {
  if (rooms.length === 1) {
    if (!shapeOk(rooms[0].type, rect.width, rect.depth)) return null;
    return [{ ...rooms[0], x: roundMm(rect.x), y: roundMm(rect.y), width: roundMm(rect.width), depth: roundMm(rect.depth) }];
  }
  const { split, flip } = pick(rooms.length);
  const A = rooms.slice(0, split), B = rooms.slice(split);
  const ta = sum(targets.slice(0, split)), tb = sum(targets.slice(split));
  const alongX = (rect.width >= rect.depth) !== flip;
  const total = alongX ? rect.width : rect.depth;
  const cut = snap((total * ta) / (ta + tb));
  if (cut < 0.9 || total - cut < 0.9) return null;
  const ra: Rect = alongX ? { x: rect.x, y: rect.y, width: cut, depth: rect.depth } : { x: rect.x, y: rect.y, width: rect.width, depth: cut };
  const rb: Rect = alongX ? { x: roundMm(rect.x + cut), y: rect.y, width: roundMm(rect.width - cut), depth: rect.depth } : { x: rect.x, y: roundMm(rect.y + cut), width: rect.width, depth: roundMm(rect.depth - cut) };
  const left = guillotine(ra, A, targets.slice(0, split), pick);
  if (!left) return null;
  const right = guillotine(rb, B, targets.slice(split), pick);
  return right ? [...left, ...right] : null;
}

export function regenerateUnlocked(project: Project, floorId: string, input: RegenInput = {}): RegenResult {
  const fi = project.floors.findIndex((f) => f.id === floorId);
  const fail = (msg: string, l = 0, u = 0): RegenResult => ({ options: [], errors: [msg], lockedCount: l, unlockedCount: u });
  if (fi < 0) return fail("Floor not found.");
  const rooms = project.floors[fi].rooms.filter((r) => r.width > 0 && r.depth > 0);
  if (!rooms.length) return fail("This floor has no rooms to rearrange.");
  const locked = rooms.filter((r) => r.locked), free = rooms.filter((r) => !r.locked);
  if (!free.length) return fail("Every room on this floor is locked, so there is nothing to rearrange. Unlock at least one room.", locked.length, 0);
  for (let i = 0; i < locked.length; i++) for (let j = i + 1; j < locked.length; j++) {
    const a = locked[i], b = locked[j];
    const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), oy = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
    if (ox > 0.02 && oy > 0.02) return fail(`Locked rooms "${a.name}" and "${b.name}" overlap. Fix that first.`, locked.length, free.length);
  }
  const x0 = Math.min(...rooms.map((r) => r.x)), y0 = Math.min(...rooms.map((r) => r.y));
  const outline: Rect = { x: x0, y: y0, width: roundMm(Math.max(...rooms.map((r) => r.x + r.width)) - x0), depth: roundMm(Math.max(...rooms.map((r) => r.y + r.depth)) - y0) };
  const rects = freeRects(outline, locked).filter((r) => r.width * r.depth > 0.5);
  const freeArea = sum(rects.map(rectArea));
  if (!rects.length || freeArea < 1) return fail("The locked rooms fill the whole floor outline, so there is no space to rearrange the others in.", locked.length, free.length);
  const oldArea = sum(free.map(rectArea));
  const k = freeArea / oldArea;
  const targets = new Map(free.map((r) => [r.id, rectArea(r) * k]));
  const weights = { ...DEFAULT_ADJACENCY, ...(input.weights ?? {}) };
  const north = input.northAngle ?? 0;
  const flip = input.frontSide === "top";
  const D = outline.depth;

  const rnd = mulberry(20260101);
  const reasons = new Set<string>();
  const found: Array<{ rooms: Room[]; openings: OpeningSpec[]; score: number; adj: number; notes: string[] }> = [];
  const seen = new Set<string>();
  const attempts = Math.max(20, Math.min(2000, input.attempts ?? 1500));

  for (let a = 0; a < attempts; a++) {
    const order = a === 0 ? free : shuffle(free, rnd);
    const rectOrder = a === 0 ? [...rects].sort((p, q) => rectArea(q) - rectArea(p)) : shuffle(rects, rnd);
    // hand rooms to rectangles in sequence, each rectangle taking rooms until its area is used up
    const groups: Room[][] = rectOrder.map(() => []);
    let ri = 0, cap = rectArea(rectOrder[0]);
    for (const r of order) {
      const t = targets.get(r.id) ?? 0;
      while (ri < rectOrder.length - 1 && cap < 0.5 * t) { ri++; cap = rectArea(rectOrder[ri]); }
      groups[ri].push(r);
      cap -= t;
    }
    if (groups.some((g) => !g.length)) { reasons.add("The free space splits into pieces that the unlocked rooms cannot fill evenly."); continue; }
    const placed: Room[] = [];
    let ok = true;
    for (let g = 0; g < groups.length && ok; g++) {
      const pick = (n: number) => ({ split: a === 0 ? Math.max(1, Math.round(n / 2)) : 1 + Math.floor(rnd() * (n - 1)), flip: a === 0 ? false : rnd() < 0.25 });
      const s = guillotine(rectOrder[g], groups[g], groups[g].map((r) => targets.get(r.id) ?? 1), pick);
      if (!s) { ok = false; reasons.add("Some rooms would get an unsuitable shape in the space that is left."); break; }
      placed.push(...s);
    }
    if (!ok) continue;
    const all = [...locked, ...placed];
    const key = placed.map((r) => `${r.id}:${r.x},${r.y},${r.width},${r.depth}`).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const circ = checkCirculation([all], [], outline);
    const bad = circ.issues.find((i) => i.severity === "error");
    if (bad) { reasons.add(bad.message); continue; }
    // doors and windows in the local frame the planner expects (front edge at local y = D)
    const toLocal = (r: Room): Room => ({ ...r, x: roundMm(r.x - outline.x), y: roundMm(flip ? outline.y + D - r.y - r.depth : r.y - outline.y) });
    const c = planOpenings(fi, all.map(toLocal), D, all.some((r) => r.type === "staircase"));
    if (c.unreachable.length) { reasons.add(`${c.unreachable[0]} cannot be reached by a door.`); continue; }
    const openings = c.specs.map((s) => ({ ...s, x: roundMm(outline.x + s.x), y: roundMm(flip ? outline.y + D - s.y : outline.y + s.y) }));
    const adj = scoreAdjacency([all], weights);
    const day = daylightScore([all], openings.map((o) => ({ ...o, floorIndex: 0 })), north);
    const dev = sum(placed.map((r) => Math.abs(rectArea(r) - rectArea(free.find((f) => f.id === r.id) as Room)) / rectArea(free.find((f) => f.id === r.id) as Room))) / placed.length;
    const score = Math.round((adj.score + 0.2 * day - 8 * dev - 6 * c.missingWindows.length) * 10) / 10;
    const notes = [`Room relationships ${adj.score}/100; daylight ${day}/100; rooms changed size by ${Math.round(dev * 100)}% on average.`];
    for (const m of c.missingWindows) notes.push(`${m} has no outside wall, so no window.`);
    found.push({ rooms: all, openings, score, adj: adj.score, notes });
  }
  if (!found.length) return fail(`No arrangement of the unlocked rooms fits around the locked ones. ${[...reasons].slice(0, 2).join(" ")} Try unlocking a room or locking fewer.`, locked.length, free.length);
  found.sort((p, q) => q.score - p.score);
  const top: typeof found = [];
  for (const f of found) {
    if (top.length >= 3) break;
    // different enough: at least one room moved by more than 0.5 m compared with every option already chosen
    const same = top.some((t) => f.rooms.every((r) => { const o = t.rooms.find((x) => x.id === r.id); return !!o && Math.abs(o.x - r.x) < 0.5 && Math.abs(o.y - r.y) < 0.5; }));
    if (!same) top.push(f);
  }
  const options: RegenOption[] = top.map((f, i) => ({
    id: `regen_${i + 1}`, label: `Arrangement ${String.fromCharCode(65 + i)}`,
    summary: `${locked.length} locked, ${free.length} rearranged; score ${f.score}`,
    score: f.score, rooms: f.rooms, openings: f.openings, notes: f.notes,
  }));
  return { options, errors: [], lockedCount: locked.length, unlockedCount: free.length };
}

/** One undoable change: replaces the rooms, walls, doors and windows of that floor (other floors are untouched). */
export function applyRegen(project: Project, floorId: string, option: RegenOption): { project: Project; failed: string[] } {
  const failed: string[] = [];
  let p = mapFloor(project, floorId, (f) => ({ ...f, rooms: option.rooms.map((r) => ({ ...r })), walls: [], openings: [] }));
  p = generateWalls(p, floorId);
  const order = (s: OpeningSpec) => (s.kind === "door" ? 0 : 1);
  for (const s of [...option.openings].sort((a, b) => order(a) - order(b))) {
    const floor = p.floors.find((f) => f.id === floorId)!;
    let best: { id: string; t: number; dist: number } | null = null;
    for (const w of floor.walls) {
      const pr = projectOnWall(w, { x: s.x, y: s.y });
      if (pr.t < 0 || pr.t > wallLength(w)) continue;
      if (pr.dist < 0.03 && (!best || pr.dist < best.dist)) best = { id: w.id, t: pr.t, dist: pr.dist };
    }
    if (!best) { failed.push(`${s.purpose}: no wall found`); continue; }
    const res = addOpeningOnWall(p, floorId, best.id, s.kind, best.t, { width: s.width, height: s.height, sill: s.sill });
    if ("error" in res) failed.push(`${s.purpose}: ${res.error}`);
    else p = res.project;
  }
  return { project: p, failed };
}
