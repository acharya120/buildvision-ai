import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import type { EdgeSide } from "../review/roomEdges";

export const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Sector = (typeof SECTORS)[number];
export const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** smallest signed difference a-b in degrees, -180..180 */
export const angDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
export const sectorOf = (bearing: number): Sector => SECTORS[Math.round(norm360(bearing) / 45) % 8];
export const SECTOR_NAMES: Record<Sector, string> = { N: "North", NE: "North-east", E: "East", SE: "South-east", S: "South", SW: "South-west", W: "West", NW: "North-west" };

/** True compass bearing (0 = north, clockwise) of a direction drawn on the plan (dx right, dy DOWN). */
export function bearingOfVector(dx: number, dy: number, northAngle: number): number {
  const planAngle = (Math.atan2(dx, -dy) * 180) / Math.PI; // clockwise from the top of the plan
  return norm360(planAngle - northAngle);
}
/** Direction on the plan (clockwise from plan-up) of a compass bearing. */
export const planAngleOfBearing = (bearing: number, northAngle: number) => norm360(bearing + northAngle);
/** Outward compass bearing of a room edge. */
export const edgeBearing = (side: EdgeSide, northAngle: number) => norm360({ top: 0, right: 90, bottom: 180, left: 270 }[side] - northAngle);

export function buildingBox(p: Project): { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number } | null {
  const rs = p.floors.flatMap((f) => f.rooms.filter(isValidRect));
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x)), x1 = Math.max(...rs.map((r) => r.x + r.width));
  const y0 = Math.min(...rs.map((r) => r.y)), y1 = Math.max(...rs.map((r) => r.y + r.depth));
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
