import type { Room, RoomType } from "../../model/types";
import { sharedEdgeLength, overlapArea, rectArea } from "../../geometry/rect";

/** Rooms that carry water supply or drainage. */
export const WET_TYPES: ReadonlySet<RoomType> = new Set<RoomType>(["bathroom", "toilet", "kitchen", "utility", "pantry"]);
export const isWet = (r: Pick<Room, "type">) => WET_TYPES.has(r.type);

export interface WetReport {
  wetRooms: number;
  /** total length of walls shared between two wet rooms on a floor, m */
  sharedWallM: number;
  /** share of wet rooms that touch another wet room (0..1) */
  groupedRatio: number;
  /** share of upper-floor wet area that sits above wet area of the floor below (0..1; 1 when there is no upper wet room) */
  stackedRatio: number;
  /** names of upper-floor wet rooms with no wet room below them */
  unstacked: string[];
}

/** Plumbing-efficiency figures for a set of floors (index 0 = ground). Works on any design, generated or hand-drawn. */
export function analyseWetWalls(floors: Room[][]): WetReport {
  let wetRooms = 0, shared = 0, grouped = 0;
  for (const rooms of floors) {
    const wet = rooms.filter(isWet);
    wetRooms += wet.length;
    for (let i = 0; i < wet.length; i++) {
      let touches = false;
      for (let j = 0; j < wet.length; j++) {
        if (i === j) continue;
        const len = sharedEdgeLength(wet[i], wet[j]);
        if (len >= 0.6) { touches = true; if (j > i) shared += len; }
      }
      if (touches) grouped++;
    }
  }
  let upperArea = 0, stackedArea = 0;
  const unstacked: string[] = [];
  for (let f = 1; f < floors.length; f++) {
    const below = floors[f - 1].filter(isWet);
    for (const r of floors[f].filter(isWet)) {
      const a = rectArea(r);
      const over = below.reduce((s, b) => s + overlapArea(r, b), 0);
      upperArea += a;
      stackedArea += Math.min(a, over);
      if (over < 0.5 * a) unstacked.push(`${r.name} (floor ${f + 1})`);
    }
  }
  return {
    wetRooms,
    sharedWallM: Math.round(shared * 100) / 100,
    groupedRatio: wetRooms ? grouped / wetRooms : 1,
    stackedRatio: upperArea ? stackedArea / upperArea : 1,
    unstacked,
  };
}
