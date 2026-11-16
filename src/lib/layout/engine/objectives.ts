import type { Room, RoomType } from "../../model/types";
import { rectArea } from "../../geometry/rect";
import { norm360 } from "../../analysis/compass";
import type { OpeningSpec } from "../autodesign";

/** Figures every generated candidate carries so the three objectives can be scored and compared. */
export interface Metrics {
  circRatio: number;
  alignRatio: number;
  wetGrouped: number;
  wetStacked: number;
  /** structural columns on the grid (every grid crossing) */
  columns: number;
  footprintArea: number;
}

export interface ObjectiveScores {
  /** % of built-up area that is not corridor, hall or stair (higher = less waste) */
  efficiency: number;
  /** window area on well-oriented walls relative to floor area */
  daylight: number;
  /** grid alignment, shared and stacked wet walls, fewest columns */
  economy: number;
  /** room-relationship score (adjacency matrix) */
  adjacency: number;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Share of built-up area that is NOT corridor, hall or stair, in percent. */
export const efficiencyScore = (circRatio: number): number => Math.round(100 * clamp(1 - circRatio) * 10) / 10;

/**
 * Orientation weight of a window by the compass direction it faces (north angle taken into account).
 * Heuristic for a warm climate: soft north light and morning east light are preferred, afternoon west sun is not.
 * Change it for cold climates; it is a ranking aid, not a daylight simulation.
 */
export const ORIENTATION_WEIGHT: Record<string, number> = { N: 0.85, NE: 1, E: 1, SE: 1, S: 0.9, SW: 0.55, W: 0.35, NW: 0.55 };
const SECTORS8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const DAYLIT: ReadonlySet<RoomType> = new Set<RoomType>(["living", "bedroom", "master-bedroom", "study", "dining", "kitchen"]);
const ROOM_WEIGHT: Partial<Record<RoomType, number>> = { living: 1.5, bedroom: 1.5, "master-bedroom": 1.5, study: 1, dining: 1, kitchen: 1 };

export function daylightScore(floors: Room[][], openings: OpeningSpec[], northAngle: number): number {
  let num = 0, den = 0;
  floors.forEach((rooms, fi) => {
    const wins = openings.filter((o) => o.kind === "window" && o.floorIndex === fi);
    for (const r of rooms) {
      if (!DAYLIT.has(r.type)) continue;
      const w = ROOM_WEIGHT[r.type] ?? 1;
      let lit = 0;
      for (const o of wins) {
        if (o.x < r.x - 0.05 || o.x > r.x + r.width + 0.05 || o.y < r.y - 0.05 || o.y > r.y + r.depth + 0.05) continue;
        const plan = Math.abs(o.y - r.y) < 0.05 ? 0 : Math.abs(o.x - (r.x + r.width)) < 0.05 ? 90 : Math.abs(o.y - (r.y + r.depth)) < 0.05 ? 180 : Math.abs(o.x - r.x) < 0.05 ? 270 : null;
        if (plan === null) continue;
        const sector = SECTORS8[Math.round(norm360(plan - northAngle) / 45) % 8];
        lit += (ORIENTATION_WEIGHT[sector] ?? 0.5) * o.width * o.height;
      }
      const roomScore = clamp(lit / (0.1 * rectArea(r))); // 10% of floor area, fully well-oriented, scores 1
      num += w * rectArea(r) * roomScore;
      den += w * rectArea(r);
    }
  });
  return den ? Math.round((100 * num) / den * 10) / 10 : 0;
}

export function economyScore(m: Metrics, minColumns: number, maxColumns: number): number {
  const cols = maxColumns > minColumns ? 1 - (m.columns - minColumns) / (maxColumns - minColumns) : 1;
  return Math.round(100 * (0.4 * m.alignRatio + 0.2 * m.wetGrouped + 0.25 * m.wetStacked + 0.15 * cols) * 10) / 10;
}
