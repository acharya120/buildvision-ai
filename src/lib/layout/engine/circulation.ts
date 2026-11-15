import type { Room, RoomType } from "../../model/types";
import { overlapArea, rectArea, roundMm } from "../../geometry/rect";
import type { OpeningSpec } from "../autodesign";
import { CORRIDOR_LIMITS, type RuleIssue } from "./types";

/** Smallest short edge (m) and largest long:short ratio per room type. Practical starting values, NOT a code check. */
export const SHAPE_RULES: Partial<Record<RoomType, { minShort: number; maxRatio: number }>> = {
  living: { minShort: 3.0, maxRatio: 2.0 },
  dining: { minShort: 2.4, maxRatio: 2.0 },
  kitchen: { minShort: 2.1, maxRatio: 2.2 },
  bedroom: { minShort: 2.7, maxRatio: 2.0 },
  "master-bedroom": { minShort: 3.0, maxRatio: 2.0 },
  study: { minShort: 2.1, maxRatio: 2.2 },
  bathroom: { minShort: 1.2, maxRatio: 2.6 },
  toilet: { minShort: 0.9, maxRatio: 3.0 },
  utility: { minShort: 1.2, maxRatio: 3.0 },
  store: { minShort: 1.2, maxRatio: 3.0 },
  garage: { minShort: 2.7, maxRatio: 2.6 },
  staircase: { minShort: 1.8, maxRatio: 3.2 },
};
const EXEMPT_RATIO: ReadonlySet<RoomType> = new Set<RoomType>(["corridor", "balcony", "lobby"]);

interface Swing { room: Room; x0: number; y0: number; x1: number; y1: number; door: OpeningSpec }

/** The room a door swings into: prefers a private room over a hall/corridor/stair; otherwise the smaller room. */
function swingRoom(door: OpeningSpec, rooms: Room[]): { room: Room; dir: "h" | "v"; sign: 1 | -1 } | null {
  const e = 0.06;
  const probes: Array<{ r: Room; dir: "h" | "v"; sign: 1 | -1 }> = [];
  for (const r of rooms) {
    const inX = door.x >= r.x - 0.01 && door.x <= r.x + r.width + 0.01, inY = door.y >= r.y - 0.01 && door.y <= r.y + r.depth + 0.01;
    if (!inX || !inY) continue;
    // door on a horizontal wall (top or bottom edge of r)
    if (Math.abs(door.y - r.y) < e) probes.push({ r, dir: "h", sign: 1 });
    else if (Math.abs(door.y - (r.y + r.depth)) < e) probes.push({ r, dir: "h", sign: -1 });
    else if (Math.abs(door.x - r.x) < e) probes.push({ r, dir: "v", sign: 1 });
    else if (Math.abs(door.x - (r.x + r.width)) < e) probes.push({ r, dir: "v", sign: -1 });
  }
  if (!probes.length) return null;
  const public_: ReadonlySet<RoomType> = new Set<RoomType>(["corridor", "lobby", "staircase", "hall", "reception", "living"]);
  const sorted = [...probes].sort((a, b) => {
    const pa = public_.has(a.r.type) ? 1 : 0, pb = public_.has(b.r.type) ? 1 : 0;
    if (pa !== pb) return pa - pb; // private (0) first
    return rectArea(a.r) - rectArea(b.r);
  });
  const p = sorted[0];
  return { room: p.r, dir: p.dir, sign: p.sign };
}

export interface CirculationReport {
  issues: RuleIssue[];
  /** corridor + lobby + staircase area / total area, per floor average (0..1) */
  circulationRatio: number;
  /** area inside the footprint not covered by any room, m2 */
  voidArea: number;
}

/**
 * Circulation and code-style rules for one design: corridor width, door swing clearance, room shape,
 * and dead space (uncovered or overlapping area inside the footprint). Pure function; changes nothing.
 */
export function checkCirculation(
  floors: Room[][],
  openings: OpeningSpec[],
  footprint: { x: number; y: number; width: number; depth: number },
  opts: { minCorridor?: number } = {},
): CirculationReport {
  const minCorr = opts.minCorridor ?? CORRIDOR_LIMITS.min;
  const issues: RuleIssue[] = [];
  let circ = 0, total = 0, voidArea = 0;
  floors.forEach((rooms, fi) => {
    const add = (severity: RuleIssue["severity"], code: string, message: string, room?: string) => issues.push({ severity, code, floor: fi, room, message });
    for (const r of rooms) {
      const short = Math.min(r.width, r.depth), long = Math.max(r.width, r.depth);
      if (r.type === "corridor" || (r.type === "lobby" && r.name === "Corridor")) {
        if (short < minCorr - 1e-6) add("error", "corridor_narrow", `${r.name} is ${short.toFixed(2)} m wide; the minimum is ${minCorr} m.`, r.name);
        else if (short < CORRIDOR_LIMITS.usualMax - 1e-6) add("info", "corridor_tight", `${r.name} is ${short.toFixed(2)} m wide (1.2 m is more comfortable).`, r.name);
        continue;
      }
      const rule = SHAPE_RULES[r.type];
      if (rule && short < rule.minShort - 1e-6) add("error", "room_narrow", `${r.name} is only ${short.toFixed(2)} m on its short side; at least ${rule.minShort} m is expected.`, r.name);
      if (rule && !EXEMPT_RATIO.has(r.type) && long / short > rule.maxRatio + 1e-6) add("error", "room_ratio", `${r.name} is ${long.toFixed(2)} x ${short.toFixed(2)} m (ratio ${(long / short).toFixed(1)}); at most ${rule.maxRatio} is expected.`, r.name);
    }
    // dead space: footprint area not covered, and overlaps
    const fpArea = footprint.width * footprint.depth;
    const covered = rooms.reduce((s, r) => s + rectArea(r), 0);
    let overlap = 0;
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) overlap += overlapArea(rooms[i], rooms[j]);
    if (fi === 0) {
      const gap = roundMm(fpArea - covered + overlap);
      voidArea = Math.max(0, gap);
      if (gap > 0.05) add("error", "dead_space", `${gap.toFixed(2)} m2 of the footprint is not part of any room (dead space).`);
    }
    if (overlap > 0.01) add("error", "overlap", `Rooms overlap by ${overlap.toFixed(2)} m2.`);
    for (const r of rooms) if (["corridor", "lobby", "staircase"].includes(r.type)) circ += rectArea(r);
    total += covered;

    // door swing clearance: each door swings a square of its own width into one room; swings must fit and not collide
    const swings: Swing[] = [];
    for (const o of openings.filter((q) => q.floorIndex === fi && q.kind === "door")) {
      const sw = swingRoom(o, rooms);
      if (!sw || o.width > 1.5) continue; // garage and wide openings do not swing
      const w = o.width, half = w / 2;
      let x0: number, x1: number, y0: number, y1: number;
      if (sw.dir === "h") { x0 = o.x - half; x1 = o.x + half; y0 = sw.sign === 1 ? o.y : o.y - w; y1 = sw.sign === 1 ? o.y + w : o.y; }
      else { y0 = o.y - half; y1 = o.y + half; x0 = sw.sign === 1 ? o.x : o.x - w; x1 = sw.sign === 1 ? o.x + w : o.x; }
      swings.push({ room: sw.room, x0, y0, x1, y1, door: o });
    }
    for (const s of swings) {
      const r = s.room;
      const clip = 0.02;
      if (s.x0 < r.x - clip || s.x1 > r.x + r.width + clip || s.y0 < r.y - clip || s.y1 > r.y + r.depth + clip) {
        add("warning", "door_swing_fit", `The door to ${r.name} (${s.door.width} m) swings into a space that is too tight.`, r.name);
      }
    }
    for (let i = 0; i < swings.length; i++) for (let j = i + 1; j < swings.length; j++) {
      const a = swings[i], b = swings[j];
      if (a.room.id !== b.room.id) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0.02 && oy > 0.02) add("error", "door_swing_clash", `Two doors in ${a.room.name} swing into each other.`, a.room.name);
    }
  });
  return { issues, circulationRatio: total ? circ / total : 0, voidArea: roundMm(voidArea) };
}
