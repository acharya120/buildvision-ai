import type { Floor, Opening, Room, Wall } from "../model/types";
import { isValidRect, roundMm } from "./rect";

export interface Pt {
  x: number;
  y: number;
}

export const wallLength = (w: Pick<Wall, "x1" | "y1" | "x2" | "y2">) =>
  Math.hypot(w.x2 - w.x1, w.y2 - w.y1);

/** Unit direction vector of a wall (start -> end). */
export function wallDir(w: Pick<Wall, "x1" | "y1" | "x2" | "y2">): Pt {
  const len = wallLength(w);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len };
}

/** Four corners of the wall as a thick rectangle centred on its centre line. */
export function wallPolygon(w: Wall): Pt[] {
  const d = wallDir(w);
  const nx = -d.y * (w.thickness / 2);
  const ny = d.x * (w.thickness / 2);
  return [
    { x: w.x1 + nx, y: w.y1 + ny },
    { x: w.x2 + nx, y: w.y2 + ny },
    { x: w.x2 - nx, y: w.y2 - ny },
    { x: w.x1 - nx, y: w.y1 - ny },
  ];
}

/** Position of an opening on its wall, in plan coordinates. */
export function openingGeometry(w: Wall, o: Opening) {
  const d = wallDir(w);
  const p0 = { x: w.x1 + d.x * o.offset, y: w.y1 + d.y * o.offset };
  const p1 = { x: p0.x + d.x * o.width, y: p0.y + d.y * o.width };
  const n = { x: -d.y, y: d.x };
  return { p0, p1, dir: d, normal: n, thickness: w.thickness };
}

const mm = (v: number) => Math.round(v * 1000);

interface Side {
  before: Array<[number, number]>; // intervals (mm) of rooms lying before the line (above / left)
  after: Array<[number, number]>; // intervals (mm) of rooms lying after the line (below / right)
}

/**
 * Split one grid line into wall pieces. A piece with a room on BOTH sides is an interior wall;
 * a piece with a room on only one side is an exterior wall. Neighbouring pieces of the same class merge.
 */
function wallPieces(side: Side): Array<{ a: number; b: number; interior: boolean }> {
  const pts = [...new Set([...side.before, ...side.after].flatMap(([a, b]) => [a, b]))].sort((p, q) => p - q);
  const covers = (list: Array<[number, number]>, a: number, b: number) => list.some(([s, e]) => s <= a && e >= b);
  const pieces: Array<{ a: number; b: number; interior: boolean }> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const bef = covers(side.before, a, b);
    const aft = covers(side.after, a, b);
    if (!bef && !aft) continue;
    const interior = bef && aft;
    const last = pieces[pieces.length - 1];
    if (last && last.b === a && last.interior === interior) last.b = b;
    else pieces.push({ a, b, interior });
  }
  return pieces;
}

/**
 * Generate walls along room edges. Edges shared by two rooms become one INTERIOR wall; edges with a
 * room on one side only become EXTERIOR walls (usually thicker). Wall centre lines sit on the room
 * edges. Deterministic ids are derived from coordinates so openings can be re-attached.
 */
export function generateWallsFromRooms(rooms: Room[], interiorThickness: number, exteriorThickness: number = interiorThickness): Wall[] {
  const horizontal = new Map<number, Side>(); // y(mm) -> sides
  const vertical = new Map<number, Side>(); // x(mm) -> sides
  const get = (map: Map<number, Side>, key: number): Side => {
    let v = map.get(key);
    if (!v) {
      v = { before: [], after: [] };
      map.set(key, v);
    }
    return v;
  };
  for (const r of rooms) {
    if (!isValidRect(r)) continue;
    const x1 = mm(r.x);
    const x2 = mm(r.x + r.width);
    const y1 = mm(r.y);
    const y2 = mm(r.y + r.depth);
    get(horizontal, y1).after.push([x1, x2]); // room is below its top edge
    get(horizontal, y2).before.push([x1, x2]); // room is above its bottom edge
    get(vertical, x1).after.push([y1, y2]); // room is right of its left edge
    get(vertical, x2).before.push([y1, y2]); // room is left of its right edge
  }
  const walls: Wall[] = [];
  for (const y of [...horizontal.keys()].sort((a, b) => a - b)) {
    for (const { a, b, interior } of wallPieces(horizontal.get(y)!)) {
      walls.push({ id: `wall_auto_h_${y}_${a}_${b}`, x1: a / 1000, y1: y / 1000, x2: b / 1000, y2: y / 1000, thickness: interior ? interiorThickness : exteriorThickness, auto: true });
    }
  }
  for (const x of [...vertical.keys()].sort((a, b) => a - b)) {
    for (const { a, b, interior } of wallPieces(vertical.get(x)!)) {
      walls.push({ id: `wall_auto_v_${x}_${a}_${b}`, x1: x / 1000, y1: a / 1000, x2: x / 1000, y2: b / 1000, thickness: interior ? interiorThickness : exteriorThickness, auto: true });
    }
  }
  return walls;
}

/** Distance and parameter of a point projected on a wall centre line. */
export function projectOnWall(w: Wall, p: Pt): { t: number; dist: number } {
  const d = wallDir(w);
  const t = (p.x - w.x1) * d.x + (p.y - w.y1) * d.y;
  const px = w.x1 + d.x * t;
  const py = w.y1 + d.y * t;
  return { t, dist: Math.hypot(p.x - px, p.y - py) };
}

/**
 * Rebuild a floor's walls from its rooms, keeping user-drawn walls and re-attaching openings
 * to whichever new wall now carries their centre point. Openings that no longer sit on any
 * wall keep their old wallId and will be reported by validation (never silently deleted).
 */
export function regenerateFloorWalls(floor: Floor, interiorThickness: number, exteriorThickness: number = interiorThickness): Floor {
  const userWalls = floor.walls.filter((w) => !w.auto);
  const autoWalls = generateWallsFromRooms(floor.rooms, interiorThickness, exteriorThickness);
  const walls = [...autoWalls, ...userWalls];
  const oldById = new Map(floor.walls.map((w) => [w.id, w]));
  const openings = floor.openings.map((o) => {
    const old = oldById.get(o.wallId);
    if (!old) return o;
    const g = openingGeometry(old, o);
    const centre = { x: (g.p0.x + g.p1.x) / 2, y: (g.p0.y + g.p1.y) / 2 };
    const candidates = walls
      .map((w) => ({ w, ...projectOnWall(w, centre) }))
      .filter((c) => c.dist < 0.01 && c.t >= -0.001 && c.t <= wallLength(c.w) + 0.001);
    if (!candidates.length) return o;
    const same = candidates.find((c) => c.w.id === o.wallId);
    const best = same ?? candidates[0];
    const offset = Math.max(0, roundMm(best.t - o.width / 2));
    return { ...o, wallId: best.w.id, offset };
  });
  return { ...floor, walls, openings };
}

export interface WallSolid {
  /** extents along the wall, m from wall start */
  a0: number;
  a1: number;
  /** vertical extents above the floor level, m */
  z0: number;
  z1: number;
}

/** Break a wall into solid boxes that leave the openings clear (used by 3D and OBJ export). */
export function wallSolids(wall: Wall, openings: Opening[], height: number): WallSolid[] {
  const len = wallLength(wall);
  const own = openings
    .filter((o) => o.wallId === wall.id && o.width > 0 && o.height > 0)
    .map((o) => ({
      a0: Math.max(0, o.offset),
      a1: Math.min(len, o.offset + o.width),
      z0: Math.max(0, o.sill),
      z1: Math.min(height, o.sill + o.height),
    }))
    .filter((o) => o.a1 > o.a0 && o.z1 > o.z0)
    .sort((p, q) => p.a0 - q.a0);
  const solids: WallSolid[] = [];
  let cursor = 0;
  for (const o of own) {
    const start = Math.max(cursor, o.a0);
    if (o.a0 > cursor + 1e-6) solids.push({ a0: cursor, a1: o.a0, z0: 0, z1: height });
    if (o.z0 > 1e-6) solids.push({ a0: start, a1: o.a1, z0: 0, z1: o.z0 });
    if (o.z1 < height - 1e-6) solids.push({ a0: start, a1: o.a1, z0: o.z1, z1: height });
    cursor = Math.max(cursor, o.a1);
  }
  if (len > cursor + 1e-6) solids.push({ a0: cursor, a1: len, z0: 0, z1: height });
  return solids;
}
