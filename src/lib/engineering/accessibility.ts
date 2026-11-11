import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { roomOpenings } from "../review/roomEdges";
import { setbackDistances } from "../analysis/compliance";
import type { Check } from "../analysis/compliance";

export interface AccessRules {
  minDoorWidth: number | null; minEntranceWidth: number | null; minCorridor: number | null;
  turningCircle: number | null; maxRampSlopeRatio: number | null; minStairWidth: number | null; minLiftW: number | null; minLiftD: number | null;
}
export const EMPTY_ACCESS: AccessRules = { minDoorWidth: null, minEntranceWidth: null, minCorridor: null, turningCircle: null, maxRampSlopeRatio: null, minStairWidth: null, minLiftW: null, minLiftD: null };
/** Commonly used universal-design guideline values. Editable examples, not your local code. */
export const EXAMPLE_ACCESS: AccessRules = { minDoorWidth: 0.9, minEntranceWidth: 1.0, minCorridor: 1.2, turningCircle: 1.5, maxRampSlopeRatio: 12, minStairWidth: 1.0, minLiftW: 1.1, minLiftD: 1.4 };

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

export function checkAccessibility(p: Project, r: AccessRules): Check[] {
  const out: Check[] = [];
  let n = 0;
  const add = (group: string, label: string, req: number | null, actual: number | null, unit: string, kind: "min" | "max" = "min") => {
    const id = `a${++n}`;
    if (req == null || actual == null) return out.push({ id, group, label, required: req == null ? "not set" : `${kind === "min" ? "at least" : "at most"} ${f2(req)} ${unit}`, actual: actual == null ? "-" : `${f2(actual)} ${unit}`, status: "not set" });
    const ok = kind === "min" ? actual + 1e-6 >= req : actual <= req + 1e-6;
    out.push({ id, group, label, required: `${kind === "min" ? "at least" : "at most"} ${f2(req)} ${unit}`, actual: `${f2(actual)} ${unit}`, status: ok ? "pass" : "fail" });
  };
  const g = p.floors[0];
  const entranceIds = new Set<string>();
  for (const f of p.floors) {
    for (const room of f.rooms.filter(isValidRect)) {
      const name = `${room.name || ROOM_TYPE_LABELS[room.type]} (${f.name})`;
      for (const ro of roomOpenings(f, room)) {
        if (ro.opening.kind !== "door") continue;
        if (f === g && ro.edge.exterior) { if (!entranceIds.has(ro.opening.id)) { entranceIds.add(ro.opening.id); add("Doors", `Entrance door - ${name}`, r.minEntranceWidth, ro.opening.width, "m"); } }
        else add("Doors", `Door into ${name}`, r.minDoorWidth, ro.opening.width, "m");
      }
      if (room.type === "corridor") add("Circulation", `Corridor ${name} width`, r.minCorridor, Math.min(room.width, room.depth), "m");
      if (room.type === "staircase") add("Stairs", `Staircase ${name} narrow side`, r.minStairWidth, Math.min(room.width, room.depth), "m");
      if (room.type === "lift") { add("Lift", `Lift ${name} width`, r.minLiftW, Math.min(room.width, room.depth), "m"); add("Lift", `Lift ${name} depth`, r.minLiftD, Math.max(room.width, room.depth), "m"); }
    }
  }
  // an accessible bathroom or toilet on the ground floor that fits a turning circle
  if (g) {
    const wet = g.rooms.filter((q) => isValidRect(q) && (q.type === "bathroom" || q.type === "toilet"));
    const best = wet.reduce((m, q) => Math.max(m, Math.min(q.width, q.depth)), 0);
    add("Rooms", "Ground-floor bathroom/toilet: largest clear width (turning circle)", r.turningCircle, wet.length ? best : null, "m");
    const hasBed = g.rooms.some((q) => q.type === "bedroom" || q.type === "master-bedroom");
    out.push({ id: `a${++n}`, group: "Rooms", label: "Bedroom and bathroom on the ground floor (step-free living)", required: "recommended when there are upper floors", actual: wet.length && hasBed ? "yes" : "no", status: p.floors.length <= 1 || (wet.length && hasBed) ? "pass" : "fail" });
    // ramp: needed length = plinth height x slope ratio, space = distance from the entrance outwards to the plot edge
    const plinth = p.detail?.plinthHeight ?? 0.45;
    if (r.maxRampSlopeRatio != null) {
      const need = plinth * r.maxRampSlopeRatio;
      const sb = setbackDistances(p);
      let space: number | null = null;
      if (sb) {
        for (const room of g.rooms.filter(isValidRect)) {
          const d = roomOpenings(g, room).find((o) => o.opening.kind === "door" && o.edge.exterior);
          if (d) { space = { top: sb.top, bottom: sb.bottom, left: sb.left, right: sb.right }[d.edge.side]; break; }
        }
      }
      out.push({ id: `a${++n}`, group: "Entrance", label: `Ramp for ${f2(plinth)} m plinth at 1:${r.maxRampSlopeRatio}`, required: `${f2(need)} m of run`, actual: space == null ? "no entrance found" : `${f2(space)} m available outside`, status: space == null ? "not set" : space >= need ? "pass" : "fail" });
    }
    if (p.floors.length > 1 && !p.floors.some((f) => f.rooms.some((q) => q.type === "lift"))) out.push({ id: `a${++n}`, group: "Lift", label: "Lift for upper floors", required: "provide a lift or ground-floor alternatives", actual: "no lift room", status: "fail" });
  }
  return out;
}
