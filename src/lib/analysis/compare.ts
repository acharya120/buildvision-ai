import type { Project, RoomType } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { areaSummary } from "../structure/areas";
import { reviewProject, reviewSummary } from "../review/review";
import { buildTakeoff } from "../materials/takeoff";
import { vastuCheck } from "./vastu";

export interface Metrics {
  floors: number; builtUp: number; footprint: number; coveragePct: number; far: number;
  rooms: number; bedrooms: number; bathrooms: number; windowPct: number;
  circulationPct: number; wetPct: number; habitablePct: number;
  reviewAttention: number; reviewAdvice: number; vastuFavoured: number; vastuRated: number;
  cost: number | null; costPerSqm: number | null;
}
const CIRC = new Set<RoomType>(["corridor", "lobby", "staircase", "lift"]);
const WETT = new Set<RoomType>(["bathroom", "toilet", "kitchen", "utility"]);
const HAB = new Set<RoomType>(["living", "bedroom", "master-bedroom", "dining", "study", "office", "meeting-room", "classroom", "ward", "reception", "hall", "shop", "workshop", "laboratory"]);

export function designMetrics(p: Project): Metrics {
  const a = areaSummary(p);
  const rooms = p.floors.flatMap((f) => f.rooms.filter(isValidRect));
  const total = rooms.reduce((s, r) => s + r.width * r.depth, 0);
  const share = (set: Set<RoomType>) => (total > 0 ? (rooms.filter((r) => set.has(r.type)).reduce((s, r) => s + r.width * r.depth, 0) / total) * 100 : 0);
  const winArea = p.floors.reduce((s, f) => s + f.openings.filter((o) => o.kind === "window").reduce((q, o) => q + o.width * o.height, 0), 0);
  const rv = reviewSummary(reviewProject(p));
  const v = vastuCheck(p);
  const t = buildTakeoff(p);
  const cost = t.materialTotal > 0 ? t.grandTotal : null;
  return {
    floors: p.floors.length, builtUp: total, footprint: a.floors[0]?.builtUp ?? 0, coveragePct: a.coveragePct, far: a.far,
    rooms: rooms.length, bedrooms: rooms.filter((r) => r.type === "bedroom" || r.type === "master-bedroom").length, bathrooms: rooms.filter((r) => r.type === "bathroom").length,
    windowPct: total > 0 ? (winArea / total) * 100 : 0, circulationPct: share(CIRC), wetPct: share(WETT), habitablePct: share(HAB),
    reviewAttention: rv.attention, reviewAdvice: rv.advice, vastuFavoured: v.favoured, vastuRated: v.rated,
    cost, costPerSqm: cost != null && total > 0 ? cost / total : null,
  };
}

/** Plain-language hints on how efficiently the plan uses its area. Advice only. */
export function spaceHints(m: Metrics): string[] {
  const h: string[] = [];
  if (m.circulationPct > 18) h.push(`Circulation (stairs, corridors, lobbies) takes ${m.circulationPct.toFixed(0)}% of the area. Plans usually keep this under about 15%: shorten corridors or open them into living spaces.`);
  if (m.floors > 0 && m.habitablePct > 0 && m.habitablePct < 55) h.push(`Only ${m.habitablePct.toFixed(0)}% of the area is habitable rooms. Check for oversized bathrooms, stores or lobbies.`);
  if (m.wetPct > 25) h.push(`Wet areas (kitchen, bathrooms, utility) are ${m.wetPct.toFixed(0)}% of the area. Stacking them above one another saves plumbing and area.`);
  if (m.windowPct > 0 && m.windowPct < 8) h.push(`Windows total only ${m.windowPct.toFixed(1)}% of floor area. About 10% or more is usual for daylight.`);
  if (!h.length && m.rooms) h.push("No obvious space inefficiencies found by these simple ratios.");
  return h;
}
