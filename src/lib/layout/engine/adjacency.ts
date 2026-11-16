import type { Room, RoomType } from "../../model/types";
import { sharedEdgeLength } from "../../geometry/rect";

/**
 * Room relationship weights. Positive = the two rooms work better touching, negative = better apart.
 * These are common planning rules of thumb that YOU can override; they are not code requirements.
 * Key format: the two room types sorted alphabetically and joined by "|".
 */
export type AdjacencyWeights = Record<string, number>;
const key = (a: RoomType, b: RoomType) => [a, b].sort().join("|");

export const DEFAULT_ADJACENCY: AdjacencyWeights = {
  [key("kitchen", "dining")]: 4,
  [key("kitchen", "utility")]: 3,
  [key("kitchen", "living")]: 1,
  [key("dining", "living")]: 2,
  [key("master-bedroom", "bathroom")]: 4,
  [key("bedroom", "bathroom")]: 2,
  [key("bathroom", "bathroom")]: 1,
  [key("bathroom", "toilet")]: 1,
  [key("staircase", "living")]: 2,
  [key("staircase", "corridor")]: 1,
  [key("garage", "living")]: 1,
  [key("balcony", "bedroom")]: 2,
  [key("balcony", "master-bedroom")]: 2,
  [key("balcony", "living")]: 1,
  [key("study", "bedroom")]: 0.5,
  // noise and hygiene: keep bedrooms away from the entrance/living zone and the kitchen
  [key("bedroom", "living")]: -2,
  [key("master-bedroom", "living")]: -1,
  [key("bedroom", "kitchen")]: -2,
  [key("master-bedroom", "kitchen")]: -2,
  [key("study", "kitchen")]: -1,
  [key("garage", "bedroom")]: -2,
  [key("garage", "master-bedroom")]: -2,
  [key("toilet", "kitchen")]: -2,
  [key("bathroom", "kitchen")]: -2,
  [key("toilet", "dining")]: -2,
  [key("bathroom", "dining")]: -1,
  [key("bedroom", "dining")]: -1,
};

export interface AdjacencyHit { a: string; b: string; weight: number; sharedM: number; floor: number }
export interface AdjacencyReport {
  /** sum of weights over touching pairs (positive minus negative) */
  raw: number;
  /** what the positive weights could add up to if every wanted pair touched */
  potential: number;
  /** 0..100 where 50 is neutral */
  score: number;
  hits: AdjacencyHit[];
}

/** Pairs count only if they share at least this much wall (enough for a door). */
export const MIN_SHARED = 0.9;

export function scoreAdjacency(floors: Room[][], weights: AdjacencyWeights = DEFAULT_ADJACENCY): AdjacencyReport {
  let raw = 0, potential = 0;
  const hits: AdjacencyHit[] = [];
  floors.forEach((rooms, fi) => {
    // potential: each wanted pair of types present on this floor counts once
    const seen = new Set<string>();
    for (const a of rooms) for (const b of rooms) {
      if (a.id >= b.id) continue;
      const k = key(a.type, b.type);
      const w = weights[k];
      if (w > 0 && !seen.has(k)) { seen.add(k); potential += w; }
    }
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      const w = weights[key(rooms[i].type, rooms[j].type)];
      if (!w) continue;
      const len = sharedEdgeLength(rooms[i], rooms[j]);
      if (len < MIN_SHARED) continue;
      raw += w;
      hits.push({ a: rooms[i].name, b: rooms[j].name, weight: w, sharedM: Math.round(len * 100) / 100, floor: fi });
    }
  });
  const score = Math.max(0, Math.min(100, 50 + (50 * raw) / Math.max(1, potential)));
  return { raw, potential, score: Math.round(score * 10) / 10, hits };
}
