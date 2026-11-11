import type { Floor, Opening, Room, Wall } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { wallLength } from "../geometry/walls";

export type EdgeSide = "top" | "bottom" | "left" | "right";

/** A wall that runs along one edge of a room, with the stretch of the edge it covers. */
export interface EdgeWall {
  wall: Wall;
  side: EdgeSide;
  /** plan coordinates of the shared stretch along the edge (x for top/bottom, y for left/right) */
  from: number;
  to: number;
  /** true when nothing else on this floor lies just outside the edge */
  exterior: boolean;
}

const TOLW = 0.3;
const inside = (r: Room, x: number, y: number) => x > r.x + 1e-6 && x < r.x + r.width - 1e-6 && y > r.y + 1e-6 && y < r.y + r.depth - 1e-6;

export function edgeWalls(floor: Floor, room: Room): EdgeWall[] {
  const out: EdgeWall[] = [];
  const others = floor.rooms.filter((r) => r.id !== room.id && isValidRect(r));
  const sides: Array<[EdgeSide, number, number, number, boolean]> = [
    ["top", room.y, room.x, room.x + room.width, true],
    ["bottom", room.y + room.depth, room.x, room.x + room.width, true],
    ["left", room.x, room.y, room.y + room.depth, false],
    ["right", room.x + room.width, room.y, room.y + room.depth, false],
  ];
  for (const [side, coord, a0, a1, horiz] of sides) {
    for (const w of floor.walls) {
      const isH = Math.abs(w.y1 - w.y2) < 1e-6;
      const isV = Math.abs(w.x1 - w.x2) < 1e-6;
      if (horiz ? !isH : !isV) continue;
      if (Math.abs((horiz ? w.y1 : w.x1) - coord) > TOLW) continue;
      const w0 = Math.min(horiz ? w.x1 : w.y1, horiz ? w.x2 : w.y2);
      const w1 = Math.max(horiz ? w.x1 : w.y1, horiz ? w.x2 : w.y2);
      const from = Math.max(a0, w0);
      const to = Math.min(a1, w1);
      if (to - from < 0.3) continue;
      const mid = (from + to) / 2;
      const sign = side === "top" || side === "left" ? -0.4 : 0.4;
      const px = horiz ? mid : coord + sign;
      const py = horiz ? coord + sign : mid;
      out.push({ wall: w, side, from, to, exterior: !others.some((r) => inside(r, px, py)) });
    }
  }
  return out;
}

/** Position of an opening's centre in plan coordinates. */
export function openingCentre(w: Wall, o: Opening): { x: number; y: number } {
  const len = wallLength(w);
  if (len <= 0) return { x: w.x1, y: w.y1 };
  const t = o.offset + o.width / 2;
  return { x: w.x1 + ((w.x2 - w.x1) / len) * t, y: w.y1 + ((w.y2 - w.y1) / len) * t };
}

export interface RoomOpening {
  opening: Opening;
  edge: EdgeWall;
  /** centre along the edge, plan coordinate */
  at: number;
}

/** Openings that sit on this room's edges. */
export function roomOpenings(floor: Floor, room: Room): RoomOpening[] {
  const out: RoomOpening[] = [];
  const seen = new Set<string>();
  for (const e of edgeWalls(floor, room)) {
    const horiz = e.side === "top" || e.side === "bottom";
    for (const o of floor.openings) {
      if (o.wallId !== e.wall.id || seen.has(o.id + e.side)) continue;
      const c = openingCentre(e.wall, o);
      const at = horiz ? c.x : c.y;
      if (at >= e.from - 1e-6 && at <= e.to + 1e-6) {
        seen.add(o.id + e.side);
        out.push({ opening: o, edge: e, at });
      }
    }
  }
  return out;
}
