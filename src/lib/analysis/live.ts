import type { EstimateLineItem, Project, RoomType } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { areaSummary } from "../structure/areas";
import { buildEstimate } from "../estimate/estimate";

/**
 * Light, always-current numbers for the live panel beside the plan. Pure and fast (no review, Vastu or take-off sheets).
 * Areas follow the rules already used in the app (areaSummary); quantities come from buildEstimate. PRELIMINARY: not a
 * certified area statement or a bill of quantities. Costs appear only for lines where YOU entered a rate.
 */
export interface LiveSummary {
  plotArea: number;
  roomArea: number;
  builtUp: number;
  coveragePct: number;
  far: number;
  /** corridor, lobby, stair and lift share of room area, % */
  circulationPct: number;
  byType: Array<{ type: RoomType; count: number; area: number }>;
  floors: Array<{ name: string; roomCount: number; roomArea: number; builtUp: number }>;
  /** quantity lines (flooring, masonry, plaster, paint, doors, windows, slab) */
  boq: EstimateLineItem[];
  totalCost: number | null;
  unratedCount: number;
}

const CIRC = new Set<RoomType>(["corridor", "lobby", "staircase", "lift"]);
const BOQ_KEYS = ["flooring", "masonry", "plaster", "paint", "doors", "windows", "slab-concrete"];

export function liveSummary(p: Project): LiveSummary {
  const a = areaSummary(p);
  const est = buildEstimate(p);
  const rooms = p.floors.flatMap((f) => f.rooms.filter(isValidRect));
  const roomArea = rooms.reduce((s, r) => s + r.width * r.depth, 0);
  const map = new Map<RoomType, { count: number; area: number }>();
  for (const r of rooms) {
    const e = map.get(r.type) ?? { count: 0, area: 0 };
    e.count += 1; e.area += r.width * r.depth;
    map.set(r.type, e);
  }
  const circ = rooms.filter((r) => CIRC.has(r.type)).reduce((s, r) => s + r.width * r.depth, 0);
  const boq = est.lines.filter((l) => BOQ_KEYS.includes(l.key));
  const costable = boq.filter((l) => l.costable);
  return {
    plotArea: a.plotArea,
    roomArea,
    builtUp: a.totalBuiltUp,
    coveragePct: a.coveragePct,
    far: a.far,
    circulationPct: roomArea > 0 ? (circ / roomArea) * 100 : 0,
    byType: [...map.entries()].map(([type, v]) => ({ type, ...v })).sort((x, y) => y.area - x.area),
    floors: a.floors.map((f, i) => ({ name: f.name, roomCount: p.floors[i].rooms.length, roomArea: f.roomArea, builtUp: f.builtUp })),
    boq,
    totalCost: costable.some((l) => l.amount != null) ? costable.reduce((s, l) => s + (l.amount ?? 0), 0) : null,
    unratedCount: costable.filter((l) => l.amount == null).length,
  };
}
