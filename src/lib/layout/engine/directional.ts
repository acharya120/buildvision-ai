import type { Room, RoomType } from "../../model/types";
import { bearingOfVector, SECTOR_NAMES, sectorOf, type Sector } from "../../analysis/compass";
import { ENTRANCE, VASTU_RULES, type VastuRule } from "../../analysis/vastu";
import type { OpeningSpec } from "../autodesign";

/**
 * Optional directional (Vastu) scoring for generated layouts, reusing the rules already shown in Studio > Analysis > Vastu.
 * Vastu is a traditional belief system, not engineering or science. It only ranks layouts; it never overrides setbacks,
 * grid, circulation or any other rule.
 */
export interface DirectionalReport {
  /** 0..100 */
  score: number;
  satisfied: string[];
  unmet: string[];
}

const POINTS = { favoured: 1, acceptable: 0.6, neutral: 0.4, avoid: 0 } as const;
type Rating = keyof typeof POINTS;
const rateSector = (rule: VastuRule, s: Sector | "Centre"): Rating => {
  if (s === "Centre") return rule.centreAvoid ? "avoid" : "neutral";
  if (rule.good.includes(s)) return "favoured";
  if (rule.avoid.includes(s)) return "avoid";
  if (rule.ok.includes(s)) return "acceptable";
  return "neutral";
};

export function directionalScore(floors: Room[][], openings: OpeningSpec[], northAngle: number): DirectionalReport {
  const all = floors.flat();
  if (!all.length) return { score: 50, satisfied: [], unmet: [] };
  const x0 = Math.min(...all.map((r) => r.x)), x1 = Math.max(...all.map((r) => r.x + r.width));
  const y0 = Math.min(...all.map((r) => r.y)), y1 = Math.max(...all.map((r) => r.y + r.depth));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, size = Math.max(x1 - x0, y1 - y0);
  const sectorAt = (x: number, y: number): Sector | "Centre" => (Math.hypot(x - cx, y - cy) < size * 0.1 ? "Centre" : sectorOf(bearingOfVector(x - cx, y - cy, northAngle)));
  const satisfied: string[] = [], unmet: string[] = [];
  let pts = 0, n = 0;
  floors.forEach((rooms, fi) => {
    for (const r of rooms) {
      const rule = VASTU_RULES[r.type as RoomType];
      if (!rule) continue;
      const s = sectorAt(r.x + r.width / 2, r.y + r.depth / 2);
      const rating = rateSector(rule, s);
      pts += POINTS[rating]; n++;
      const where = s === "Centre" ? "the centre" : SECTOR_NAMES[s];
      (rating === "favoured" || rating === "acceptable" ? satisfied : unmet).push(`${r.name}${floors.length > 1 ? ` (floor ${fi + 1})` : ""}: ${where}${rating === "avoid" ? " (avoid)" : ""}`);
    }
  });
  const door = openings.find((o) => o.kind === "door" && o.floorIndex === 0 && o.purpose.startsWith("Main entrance"));
  if (door) {
    const s = sectorAt(door.x, door.y);
    const rating = s === "Centre" ? "neutral" : rateSector(ENTRANCE, s);
    pts += 2 * POINTS[rating]; n += 2; // the entrance counts double
    const where = s === "Centre" ? "the centre" : SECTOR_NAMES[s];
    (rating === "favoured" || rating === "acceptable" ? satisfied : unmet).push(`Main entrance: ${where}${rating === "avoid" ? " (avoid)" : ""}`);
  }
  return { score: n ? Math.round((100 * pts) / n * 10) / 10 : 50, satisfied, unmet };
}
