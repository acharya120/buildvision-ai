import type { Floor, Project, Room, RoomType } from "../model/types";
import { isValidRect, sharedEdgeLength } from "../geometry/rect";
import { addOpeningOnWall, getFloor } from "../model/ops";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { edgeWalls, roomOpenings, type EdgeSide } from "./roomEdges";

export type ReviewLevel = "attention" | "advice" | "good";

export interface ReviewFix {
  kind: "window";
  floorId: string;
  roomId: string;
  label: string;
}

export interface ReviewFinding {
  id: string;
  level: ReviewLevel;
  rule: string;
  floorId?: string;
  roomId?: string;
  message: string;
  fix?: ReviewFix;
}

const HABITABLE = new Set<RoomType>(["living", "bedroom", "master-bedroom", "kitchen", "dining", "study", "office", "classroom", "ward", "meeting-room", "reception", "hall"]);
const WET = new Set<RoomType>(["bathroom", "toilet"]);
/** Smallest sensible floor areas, m2. Rule-of-thumb only: local building rules may differ. */
const MIN_AREA: Partial<Record<RoomType, number>> = { bedroom: 9, "master-bedroom": 11, kitchen: 5, living: 11, bathroom: 2.2, toilet: 1.1, dining: 7 };

const label = (r: Room) => `${r.name || ROOM_TYPE_LABELS[r.type]}`;
const area = (r: Room) => r.width * r.depth;

/**
 * Rule-based design review. Every finding says which rule it comes from; the numbers are common
 * rules of thumb, not legal requirements, and nothing here changes the design by itself.
 */
export function reviewProject(p: Project): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  let n = 0;
  const add = (f: Omit<ReviewFinding, "id">) => out.push({ id: `rv${++n}`, ...f });

  p.floors.forEach((floor, fi) => {
    const rooms = floor.rooms.filter(isValidRect);
    for (const r of rooms) {
      const ops = roomOpenings(floor, r);
      const windows = ops.filter((o) => o.opening.kind === "window");
      const winArea = windows.reduce((s, o) => s + o.opening.width * o.opening.height, 0);
      const exteriorEdges = edgeWalls(floor, r).filter((e) => e.exterior);
      const canFix = exteriorEdges.length > 0;
      const fix: ReviewFix | undefined = canFix ? { kind: "window", floorId: floor.id, roomId: r.id, label: WET.has(r.type) ? "Add a ventilator window" : "Add a window on an outside wall" } : undefined;

      if (HABITABLE.has(r.type)) {
        if (windows.length === 0) {
          add({ level: "attention", rule: "Daylight & ventilation", floorId: floor.id, roomId: r.id, message: `${label(r)} (${floor.name}) has no window. ${canFix ? "It has an outside wall, so a window can be added." : "It has no outside wall, so it needs a light well, skylight or mechanical ventilation."}`, fix });
        } else if (winArea / area(r) < 0.1 && r.type !== "kitchen") {
          add({ level: "advice", rule: "Daylight & ventilation", floorId: floor.id, roomId: r.id, message: `${label(r)} (${floor.name}): window area is ${((winArea / area(r)) * 100).toFixed(0)}% of floor area. A common rule of thumb is at least 10%.`, fix });
        } else {
          const sides = new Set<EdgeSide>(windows.map((w) => w.edge.side));
          if (sides.size === 1 && area(r) >= 9 && canFix && exteriorEdges.some((e) => !sides.has(e.side))) {
            add({ level: "advice", rule: "Cross ventilation", floorId: floor.id, roomId: r.id, message: `${label(r)} (${floor.name}) has windows on one side only. A second window on another outside wall improves cross ventilation.`, fix: { kind: "window", floorId: floor.id, roomId: r.id, label: "Add a window on another wall" } });
          }
        }
      }
      if (WET.has(r.type) && windows.length === 0) {
        add({ level: "attention", rule: "Bathroom ventilation", floorId: floor.id, roomId: r.id, message: `${label(r)} (${floor.name}) has no window or ventilator. ${canFix ? "Add a small high-level window." : "It has no outside wall, so plan an exhaust fan and duct."}`, fix });
      }
      const min = MIN_AREA[r.type];
      if (min && area(r) < min) add({ level: "advice", rule: "Room size", floorId: floor.id, roomId: r.id, message: `${label(r)} (${floor.name}) is ${area(r).toFixed(1)} m². Rooms of this type are usually at least about ${min} m².` });
      const ratio = Math.max(r.width, r.depth) / Math.min(r.width, r.depth);
      if (ratio > 2.5 && ["living", "bedroom", "master-bedroom", "dining", "kitchen"].includes(r.type)) add({ level: "advice", rule: "Room proportion", floorId: floor.id, roomId: r.id, message: `${label(r)} (${floor.name}) is long and narrow (${ratio.toFixed(1)}:1). Furniture is hard to arrange in rooms stretched beyond about 2.5:1.` });
    }

    // kitchen next to a dining/living room; no bathroom opening on the kitchen
    for (const k of rooms.filter((r) => r.type === "kitchen")) {
      const near = rooms.some((r) => (r.type === "dining" || r.type === "living") && sharedEdgeLength(k, r) > 0.8);
      if (!near && rooms.some((r) => r.type === "dining" || r.type === "living")) add({ level: "advice", rule: "Kitchen position", floorId: floor.id, roomId: k.id, message: `${label(k)} (${floor.name}) does not share a wall with a dining or living room, so serving food means crossing other spaces.` });
    }

    // floors above ground need a stair; stairs should line up
    if (p.floors.length > 1 && rooms.length) {
      const st = rooms.filter((r) => r.type === "staircase");
      if (!st.length) add({ level: "attention", rule: "Stairs", floorId: floor.id, message: `${floor.name} has no staircase room in a multi-floor building.` });
      else if (fi > 0) {
        const below = p.floors[fi - 1].rooms.filter((r) => r.type === "staircase" && isValidRect(r));
        const aligned = st.some((s) => below.some((b) => overlap(s, b) / Math.min(area(s), area(b)) >= 0.6));
        if (below.length && !aligned) add({ level: "attention", rule: "Stairs", floorId: floor.id, roomId: st[0].id, message: `The staircase on ${floor.name} does not sit above the staircase on ${p.floors[fi - 1].name}. Flights should line up from floor to floor.` });
      }
    }
  });

  // whole-building checks on the ground floor
  const g = p.floors[0];
  if (g && g.rooms.length) {
    const hasEntrance = g.openings.some((o) => {
      if (o.kind !== "door") return false;
      return g.rooms.some((r) => roomOpenings(g, r).some((ro) => ro.opening.id === o.id && ro.edge.exterior));
    });
    if (!hasEntrance) add({ level: "attention", rule: "Entrance", floorId: g.id, message: "No door on an outside wall of the ground floor, so there is no entrance yet." });
    const all = p.floors.flatMap((f) => f.rooms);
    const beds = all.filter((r) => r.type === "bedroom" || r.type === "master-bedroom").length;
    const baths = all.filter((r) => r.type === "bathroom").length;
    if (beds >= 2 && baths === 0) add({ level: "attention", rule: "Bathrooms", message: `${beds} bedrooms but no bathroom.` });
    else if (beds >= 3 && baths < Math.ceil(beds / 2)) add({ level: "advice", rule: "Bathrooms", message: `${baths} bathroom(s) for ${beds} bedrooms. One bathroom per two bedrooms is a common minimum.` });
  }

  if (!out.some((f) => f.level !== "good") && p.floors.some((f) => f.rooms.length)) add({ level: "good", rule: "Summary", message: "No issues found by the built-in checks. This is not a substitute for an architect's review." });
  return out;
}

function overlap(a: Room, b: Room): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const d = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  return w > 0 && d > 0 ? w * d : 0;
}

/**
 * Add one window to the room, on its longest outside wall (or one it does not have a window on yet).
 * Returns the new project, or an error message. Never changes anything else.
 */
export function applyWindowFix(p: Project, floorId: string, roomId: string): { project: Project } | { error: string } {
  const floor = getFloor(p, floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !room) return { error: "Room not found." };
  const wet = WET.has(room.type);
  const used = new Set(roomOpenings(floor, room).filter((o) => o.opening.kind === "window").map((o) => o.edge.side));
  const cands = edgeWalls(floor, room)
    .filter((e) => e.exterior)
    .sort((a, b) => Number(used.has(a.side)) - Number(used.has(b.side)) || b.to - b.from - (a.to - a.from));
  if (!cands.length) return { error: "This room has no outside wall to put a window on." };
  const spec = wet ? { width: 0.6, height: 0.6, sill: 1.5 } : room.type === "living" ? { width: 1.5, height: 1.2, sill: 0.9 } : { width: 1.2, height: 1.2, sill: 0.9 };
  let last = "No room on the outside walls.";
  for (const e of cands) {
    const horiz = e.side === "top" || e.side === "bottom";
    const w = e.wall;
    const startCoord = horiz ? w.x1 : w.y1;
    const dirSign = (horiz ? w.x2 - w.x1 : w.y2 - w.y1) >= 0 ? 1 : -1;
    const tryAt = (coord: number) => addOpeningOnWall(p, floorId, w.id, "window", dirSign * (coord - startCoord), spec);
    // middle of the shared stretch first, then the two thirds
    const span = e.to - e.from;
    for (const frac of [0.5, 0.3, 0.7]) {
      const r = tryAt(e.from + span * frac);
      if ("project" in r) return { project: r.project };
      last = r.error;
    }
  }
  return { error: last };
}

export function reviewSummary(findings: ReviewFinding[]) {
  return { attention: findings.filter((f) => f.level === "attention").length, advice: findings.filter((f) => f.level === "advice").length };
}

export type { Floor };
