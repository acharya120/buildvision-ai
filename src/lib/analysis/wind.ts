import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { roomOpenings } from "../review/roomEdges";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { angDiff, edgeBearing, sectorOf, type Sector } from "./compass";

export type Exposure = "windward" | "leeward" | "side";
export type FlowRating = "good" | "fair" | "poor" | "none";
export const OPENABLE_FRACTION = 0.5; // share of a window that opens (sliding/casement windows open about half)
export const MIN_VENT_RATIO = 0.05; // openable area >= 5% of floor area (common rule of thumb)

export const exposureOf = (wallBearing: number, windFrom: number): Exposure => {
  if (Math.abs(angDiff(wallBearing, windFrom)) < 67.5) return "windward";
  if (Math.abs(angDiff(wallBearing, windFrom + 180)) < 67.5) return "leeward";
  return "side";
};

export interface RoomWind {
  floorName: string;
  roomId: string;
  name: string;
  floorArea: number;
  openableArea: number;
  ratio: number;
  windward: number;
  leeward: number;
  side: number;
  rating: FlowRating;
  advice: string;
}

/**
 * Rule-based ventilation analysis from the wind direction you give (where the wind blows FROM, compass bearing).
 * It checks opening areas and whether air can enter on one side and leave on another. It is NOT a wind-tunnel or CFD study.
 */
export function windAnalysis(p: Project, windFrom: number): RoomWind[] {
  const north = p.northAngle ?? 0;
  const out: RoomWind[] = [];
  for (const f of p.floors) {
    for (const r of f.rooms.filter(isValidRect)) {
      if (["corridor", "lift", "staircase", "parking", "balcony"].includes(r.type)) continue;
      let wd = 0, lw = 0, sd = 0;
      for (const ro of roomOpenings(f, r)) {
        if (!ro.edge.exterior) continue;
        const o = ro.opening;
        const a = o.width * o.height * (o.kind === "window" ? OPENABLE_FRACTION : 1);
        const ex = exposureOf(edgeBearing(ro.edge.side, north), windFrom);
        if (ex === "windward") wd += a;
        else if (ex === "leeward") lw += a;
        else sd += a;
      }
      const floorArea = r.width * r.depth;
      const total = wd + lw + sd;
      const ratio = total / floorArea;
      let rating: FlowRating, advice: string;
      if (total === 0) { rating = "none"; advice = "No outside opening: needs a window, vent or mechanical ventilation."; }
      else if (ratio < MIN_VENT_RATIO) { rating = "poor"; advice = `Openable area is ${(ratio * 100).toFixed(1)}% of the floor; aim for at least ${MIN_VENT_RATIO * 100}%.`; }
      else if ((wd > 0 && lw > 0) || (sd > 0 && (wd > 0 || lw > 0))) { rating = "good"; advice = "Air can enter and leave on different sides (cross ventilation)."; }
      else { rating = "fair"; advice = "Openings on one side only: add an opening on another wall, or open the door to a ventilated space."; }
      out.push({ floorName: f.name, roomId: r.id, name: r.name || ROOM_TYPE_LABELS[r.type], floorArea, openableArea: total, ratio, windward: wd, leeward: lw, side: sd, rating, advice });
    }
  }
  return out;
}

export function windSummary(rows: RoomWind[]) {
  const c = { good: 0, fair: 0, poor: 0, none: 0 };
  rows.forEach((r) => c[r.rating]++);
  return c;
}
export const windSector = (b: number): Sector => sectorOf(b);
