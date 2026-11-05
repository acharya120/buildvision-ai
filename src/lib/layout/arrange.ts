import type { Plot, Room } from "../model/types";
import { isValidRect, roundMm } from "../geometry/rect";

export interface ArrangeResult {
  rooms: Room[];
  placed: string[];
  /** room names that could not be placed (they keep their current position) */
  unplaced: string[];
  note: string;
}

/**
 * Deterministic "shelf" packing: rooms are sorted largest-first and laid out left-to-right in
 * rows from the plot's top-left corner. Rooms are never rotated or resized.
 * Limitations: no adjacency logic, no daylight/orientation logic, no circulation planning,
 * no staircase alignment between floors. It is a starting point, not an architect.
 */
export function arrangeRooms(rooms: Room[], plot: Plot, gap = 0): ArrangeResult {
  const valid = rooms.filter(isValidRect);
  const sorted = [...valid].sort((a, b) => b.depth - a.depth || b.width - a.width || a.name.localeCompare(b.name));
  const positions = new Map<string, { x: number; y: number }>();
  const unplaced: string[] = [];

  let x = 0;
  let y = 0;
  let rowDepth = 0;
  for (const r of sorted) {
    if (r.width > plot.width + 1e-6 || r.depth > plot.depth + 1e-6) {
      unplaced.push(r.name);
      continue;
    }
    if (x + r.width > plot.width + 1e-6) {
      x = 0;
      y = roundMm(y + rowDepth + gap);
      rowDepth = 0;
    }
    if (y + r.depth > plot.depth + 1e-6) {
      unplaced.push(r.name);
      continue;
    }
    positions.set(r.id, { x: roundMm(x), y: roundMm(y) });
    x = roundMm(x + r.width + gap);
    rowDepth = Math.max(rowDepth, r.depth);
  }

  const out = rooms.map((r) => {
    const pos = positions.get(r.id);
    return pos ? { ...r, x: pos.x, y: pos.y } : r;
  });
  const placed = rooms.filter((r) => positions.has(r.id)).map((r) => r.name);
  const note = unplaced.length
    ? `${unplaced.length} room(s) do not fit in the remaining plot area and were left where they are: ${unplaced.join(", ")}.`
    : "All rooms were placed inside the plot.";
  return { rooms: out, placed, unplaced, note };
}
