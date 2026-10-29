import type { Room } from "../model/types";

/** A solid box in plan coordinates (metres) standing on the floor: occupies [0, top] vertically. */
export interface StairBlock {
  x: number;
  y: number;
  width: number;
  depth: number;
  top: number;
  kind: "step" | "landing";
}

/**
 * Visual stair for a staircase room: a two-flight (U / dog-leg) stair that climbs from the floor level
 * to the floor above (`height`). Flights run along the room's longer side. This is a 3D visualisation
 * aid only; it is NOT a designed stair (rise, going, headroom and landings are not checked).
 */
export function stairBlocks(room: Pick<Room, "x" | "y" | "width" | "depth">, height: number): StairBlock[] {
  const alongY = room.depth >= room.width;
  const L = alongY ? room.depth : room.width; // length along the climb direction
  const Wd = alongY ? room.width : room.depth; // across
  if (!(L > 1.2) || !(Wd > 0.8) || !(height > 1)) return [];
  const landing = Math.min(Wd, 1.0);
  const flightLen = L - landing;
  // number of steps in each flight so that the rise stays near 0.17 m
  let n = Math.max(3, Math.ceil(height / 0.17 / 2) - 1);
  while (n > 3 && flightLen / n < 0.2) n--;
  const rise = height / (2 * n + 2);
  const gap = Wd >= 1.6 ? 0.1 : 0.05;
  const lane = (Wd - gap) / 2;
  const going = flightLen / n;
  const out: StairBlock[] = [];
  const box = (s: number, a: number, len: number, wid: number, top: number, kind: StairBlock["kind"]) => {
    // s: position along climb axis, a: across position
    out.push(alongY ? { x: room.x + a, y: room.y + s, width: wid, depth: len, top, kind } : { x: room.x + s, y: room.y + a, width: len, depth: wid, top, kind });
  };
  for (let k = 1; k <= n; k++) {
    box((k - 1) * going, 0, going, lane, k * rise, "step"); // up flight, lane A
    box(flightLen - k * going, lane + gap, going, lane, (n + 1 + k) * rise, "step"); // down flight, lane B (returns)
  }
  box(flightLen, 0, landing, Wd, (n + 1) * rise, "landing");
  return out;
}
