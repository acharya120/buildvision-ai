import type { Project, RoomType } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { roomOpenings } from "../review/roomEdges";
import { buildingBox, bearingOfVector, edgeBearing, sectorOf, SECTOR_NAMES, type Sector } from "./compass";

export type VastuRating = "favoured" | "acceptable" | "neutral" | "avoid";
export interface VastuRule { good: Sector[]; ok: Sector[]; avoid: Sector[]; centreAvoid?: boolean; text: string }

/**
 * Commonly quoted Vastu Shastra guidelines. Vastu is a traditional belief system: schools differ, and nothing here is
 * scientifically or structurally verified. It is offered as an optional guide only.
 */
export const VASTU_RULES: Partial<Record<RoomType, VastuRule>> = {
  living: { good: ["N", "NE", "E"], ok: ["NW"], avoid: [], text: "Living room: north, north-east or east." },
  "master-bedroom": { good: ["SW"], ok: ["S", "W"], avoid: ["NE"], text: "Master bedroom: south-west." },
  bedroom: { good: ["W", "NW"], ok: ["S", "SW", "N"], avoid: ["NE"], text: "Bedroom: west or north-west; avoid north-east." },
  kitchen: { good: ["SE"], ok: ["NW"], avoid: ["NE", "SW"], centreAvoid: true, text: "Kitchen: south-east (fire corner), or north-west." },
  dining: { good: ["W", "E"], ok: ["N", "NW"], avoid: [], text: "Dining: west or east, next to the kitchen." },
  bathroom: { good: ["NW", "W"], ok: ["S"], avoid: ["NE", "SW"], centreAvoid: true, text: "Bathroom: north-west or west; avoid north-east and the centre." },
  toilet: { good: ["NW", "W"], ok: ["S"], avoid: ["NE", "SW"], centreAvoid: true, text: "Toilet: north-west or west; avoid north-east and the centre." },
  staircase: { good: ["S", "W", "SW"], ok: ["SE", "NW"], avoid: ["NE"], centreAvoid: true, text: "Staircase: south, west or south-west; avoid north-east and the centre." },
  study: { good: ["W", "NW", "N", "E"], ok: ["S"], avoid: [], text: "Study: west, north-west, north or east." },
  store: { good: ["NW", "SW"], ok: ["W", "S"], avoid: ["NE"], text: "Store: north-west or south-west." },
  garage: { good: ["NW", "SE"], ok: ["S", "W"], avoid: ["NE"], text: "Garage: north-west or south-east." },
};
const ENTRANCE: VastuRule = { good: ["N", "NE", "E"], ok: ["NW", "SE"], avoid: ["SW"], text: "Main entrance: north, north-east or east." };

export interface VastuRoom { floorName: string; roomId: string; name: string; type: RoomType; sector: Sector | "Centre"; rating: VastuRating; text: string }
export interface VastuResult {
  rooms: VastuRoom[];
  entrance: { sector: Sector; rating: VastuRating; text: string } | null;
  favoured: number;
  rated: number;
  avoid: VastuRoom[];
}

function rate(rule: VastuRule, sector: Sector | "Centre"): VastuRating {
  if (sector === "Centre") return rule.centreAvoid ? "avoid" : "neutral";
  if (rule.good.includes(sector)) return "favoured";
  if (rule.avoid.includes(sector)) return "avoid";
  if (rule.ok.includes(sector)) return "acceptable";
  return "neutral";
}

export function vastuCheck(p: Project): VastuResult {
  const box = buildingBox(p);
  const north = p.northAngle ?? 0;
  const out: VastuRoom[] = [];
  if (box) {
    const size = Math.max(box.x1 - box.x0, box.y1 - box.y0);
    for (const f of p.floors) {
      for (const r of f.rooms.filter(isValidRect)) {
        const rule = VASTU_RULES[r.type];
        if (!rule) continue;
        const dx = r.x + r.width / 2 - box.cx, dy = r.y + r.depth / 2 - box.cy;
        const sector: Sector | "Centre" = Math.hypot(dx, dy) < size * 0.1 ? "Centre" : sectorOf(bearingOfVector(dx, dy, north));
        out.push({ floorName: f.name, roomId: r.id, name: r.name || ROOM_TYPE_LABELS[r.type], type: r.type, sector, rating: rate(rule, sector), text: rule.text });
      }
    }
  }
  let entrance: VastuResult["entrance"] = null;
  const g = p.floors[0];
  if (g) {
    for (const r of g.rooms.filter(isValidRect)) {
      const door = roomOpenings(g, r).find((o) => o.opening.kind === "door" && o.edge.exterior);
      if (door) {
        const sector = sectorOf(edgeBearing(door.edge.side, north));
        entrance = { sector, rating: rate(ENTRANCE, sector), text: ENTRANCE.text };
        break;
      }
    }
  }
  const rated = out.length + (entrance ? 1 : 0);
  const favoured = out.filter((r) => r.rating === "favoured").length + (entrance?.rating === "favoured" ? 1 : 0);
  return { rooms: out, entrance, favoured, rated, avoid: out.filter((r) => r.rating === "avoid") };
}
export { SECTOR_NAMES };
