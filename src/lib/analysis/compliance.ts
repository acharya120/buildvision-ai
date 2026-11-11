import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { rayExitDistance } from "../geometry/polygon";
import { areaSummary } from "../structure/areas";
import { ROOM_TYPE_LABELS } from "../model/defaults";

export interface Rules {
  roadSide: "bottom" | "top" | "left" | "right";
  front: number | null; rear: number | null; side: number | null;
  far: number | null; coveragePct: number | null; maxHeight: number | null;
  minHabitableArea: number | null; minHabitableWidth: number | null;
  minKitchenArea: number | null; minBathArea: number | null; minToiletArea: number | null;
  minCeilingHeight: number | null; minWindowPct: number | null;
}
export const EMPTY_RULES: Rules = { roadSide: "bottom", front: null, rear: null, side: null, far: null, coveragePct: null, maxHeight: null, minHabitableArea: null, minHabitableWidth: null, minKitchenArea: null, minBathArea: null, minToiletArea: null, minCeilingHeight: null, minWindowPct: null };
/** Commonly cited minimums for habitable rooms (India's National Building Code 2016 style). Examples only: your municipality's bylaws decide. */
export const EXAMPLE_RULES: Rules = { ...EMPTY_RULES, minHabitableArea: 9.5, minHabitableWidth: 2.4, minKitchenArea: 4.5, minBathArea: 1.8, minToiletArea: 1.1, minCeilingHeight: 2.75, minWindowPct: 10 };

export type CheckStatus = "pass" | "fail" | "not set";
export interface Check { id: string; group: string; label: string; required: string; actual: string; status: CheckStatus }

const f1 = (n: number) => (Math.round(n * 100) / 100).toString();

export function setbackDistances(p: Project) {
  const rs = p.floors.flatMap((f) => f.rooms.filter(isValidRect));
  if (!rs.length) return null;
  const bx0 = Math.min(...rs.map((r) => r.x)), bx1 = Math.max(...rs.map((r) => r.x + r.width));
  const by0 = Math.min(...rs.map((r) => r.y)), by1 = Math.max(...rs.map((r) => r.y + r.depth));
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  const pg = p.plot.polygon;
  const d = (x: number, y: number, dx: number, dy: number, fb: number) => (pg ? rayExitDistance(pg, x, y, dx, dy) : fb);
  return { left: d(bx0, cy, -1, 0, bx0), right: d(bx1, cy, 1, 0, p.plot.width - bx1), top: d(cx, by0, 0, -1, by0), bottom: d(cx, by1, 0, 1, p.plot.depth - by1) };
}

/** Self-check against the numbers YOU enter. It compares and reports; it never changes the design and is not a building approval. */
export function checkCompliance(p: Project, rules: Rules): Check[] {
  const out: Check[] = [];
  let n = 0;
  const add = (group: string, label: string, required: number | null, actual: number | null, unit: string, kind: "min" | "max") => {
    const id = `c${++n}`;
    if (required == null) return out.push({ id, group, label, required: "not set", actual: actual == null ? "-" : `${f1(actual)} ${unit}`, status: "not set" });
    if (actual == null) return out.push({ id, group, label, required: `${kind === "min" ? "at least" : "at most"} ${f1(required)} ${unit}`, actual: "-", status: "not set" });
    const ok = kind === "min" ? actual + 1e-6 >= required : actual <= required + 1e-6;
    out.push({ id, group, label, required: `${kind === "min" ? "at least" : "at most"} ${f1(required)} ${unit}`, actual: `${f1(actual)} ${unit}`, status: ok ? "pass" : "fail" });
  };
  const a = areaSummary(p);
  const far = rules.far ?? p.limits?.far ?? null, cov = rules.coveragePct ?? p.limits?.coveragePct ?? null, mh = rules.maxHeight ?? p.limits?.maxHeight ?? null;
  const height = p.floors.reduce((s, f) => s + f.height, 0) + (p.detail?.plinthHeight ?? 0.45);
  add("Plot", "Floor area ratio (FAR)", far, a.far, "", "max");
  add("Plot", "Ground coverage", cov, a.coveragePct, "%", "max");
  add("Plot", "Building height (plinth to roof slab)", mh, height, "m", "max");
  const sb = setbackDistances(p);
  if (sb) {
    const side = rules.roadSide;
    const map = { bottom: { front: sb.bottom, rear: sb.top, s1: sb.left, s2: sb.right }, top: { front: sb.top, rear: sb.bottom, s1: sb.left, s2: sb.right }, left: { front: sb.left, rear: sb.right, s1: sb.top, s2: sb.bottom }, right: { front: sb.right, rear: sb.left, s1: sb.top, s2: sb.bottom } }[side];
    add("Setbacks", "Front setback (road side)", rules.front, map.front, "m", "min");
    add("Setbacks", "Rear setback", rules.rear, map.rear, "m", "min");
    add("Setbacks", "Side setback 1", rules.side, map.s1, "m", "min");
    add("Setbacks", "Side setback 2", rules.side, map.s2, "m", "min");
  }
  for (const f of p.floors) {
    add("Heights", `Ceiling height - ${f.name}`, rules.minCeilingHeight, f.height, "m", "min");
    for (const r of f.rooms.filter(isValidRect)) {
      const area = r.width * r.depth;
      const who = `${r.name || ROOM_TYPE_LABELS[r.type]} (${f.name})`;
      if (r.type === "bedroom" || r.type === "master-bedroom" || r.type === "living") {
        add("Rooms", `${who} area`, rules.minHabitableArea, area, "m²", "min");
        add("Rooms", `${who} narrow side`, rules.minHabitableWidth, Math.min(r.width, r.depth), "m", "min");
        if (rules.minWindowPct != null) {
          const win = f.openings.filter((o) => o.kind === "window").reduce((s, o) => {
            const w = f.walls.find((q) => q.id === o.wallId);
            if (!w) return s;
            const c = { x: w.x1 + ((w.x2 - w.x1) / (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1)) * (o.offset + o.width / 2), y: w.y1 + ((w.y2 - w.y1) / (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1)) * (o.offset + o.width / 2) };
            const on = c.x >= r.x - 0.2 && c.x <= r.x + r.width + 0.2 && c.y >= r.y - 0.2 && c.y <= r.y + r.depth + 0.2;
            return on ? s + o.width * o.height : s;
          }, 0);
          add("Rooms", `${who} window area`, rules.minWindowPct, (win / area) * 100, "% of floor", "min");
        }
      } else if (r.type === "kitchen") add("Rooms", `${who} area`, rules.minKitchenArea, area, "m²", "min");
      else if (r.type === "bathroom") add("Rooms", `${who} area`, rules.minBathArea, area, "m²", "min");
      else if (r.type === "toilet") add("Rooms", `${who} area`, rules.minToiletArea, area, "m²", "min");
    }
  }
  return out;
}
export const complianceSummary = (c: Check[]) => ({ pass: c.filter((x) => x.status === "pass").length, fail: c.filter((x) => x.status === "fail").length, notSet: c.filter((x) => x.status === "not set").length });
