import type { Floor, Project, ValidationIssue } from "../model/types";
import {
  TOL,
  isInsidePlot,
  isValidRect,
  overlapArea,
  rectArea,
  rectsOverlap,
  sharedEdgeLength,
  uncoveredArea,
} from "../geometry/rect";
import { wallLength, openingGeometry } from "../geometry/walls";
import { onBoundary } from "../geometry/adjacency";
import { DEFAULT_ROOM_SIZES, ROOM_TYPE_LABELS } from "../model/defaults";

/**
 * Reports problems; never changes the design.
 * error   = geometry that is impossible or inconsistent
 * warning = probably unintended, but the user decides
 * info    = useful facts
 */
export function validateProject(p: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let n = 0;
  const add = (
    severity: ValidationIssue["severity"],
    code: string,
    message: string,
    floor?: Floor,
    elementId?: string,
  ) => issues.push({ id: `${code}_${n++}`, severity, code, message, floorId: floor?.id, elementId });

  if (!(p.plot.width > 0) || !(p.plot.depth > 0)) {
    add("error", "plot-invalid", "Plot width and depth must both be greater than zero.");
  }

  p.floors.forEach((floor, floorIndex) => {
    const label = floor.name;

    if (!(floor.height >= 2)) add("warning", "floor-height", `${label}: floor-to-floor height is very small (${floor.height.toFixed(2)} m).`, floor);

    // ---- rooms ----
    for (const r of floor.rooms) {
      if (!isValidRect(r)) {
        add("error", "room-invalid", `${label}: "${r.name}" has a zero, negative or missing size.`, floor, r.id);
        continue;
      }
      if (!isInsidePlot(r, p.plot)) {
        add("error", "room-outside-plot", `${label}: "${r.name}" extends beyond the plot boundary.`, floor, r.id);
      }
      if (!r.name.trim()) add("warning", "room-unnamed", `${label}: a room has no name.`, floor, r.id);
    }

    const valid = floor.rooms.filter(isValidRect);
    if (!p.settings.allowOverlap) {
      for (let i = 0; i < valid.length; i++) {
        for (let j = i + 1; j < valid.length; j++) {
          if (rectsOverlap(valid[i], valid[j])) {
            const a = overlapArea(valid[i], valid[j]);
            add(
              "error",
              "room-overlap",
              `${label}: "${valid[i].name}" overlaps "${valid[j].name}" by ${a.toFixed(2)} m².`,
              floor,
              valid[i].id,
            );
          }
        }
      }
    }

    // gaps: only reported when the layout rule asks for adjoining rooms
    if (p.settings.requireAdjoining && valid.length > 1) {
      for (const r of valid) {
        const touching = valid.some((o) => o.id !== r.id && sharedEdgeLength(r, o) > 0.3);
        if (!touching) add("warning", "room-isolated", `${label}: "${r.name}" does not adjoin any other room.`, floor, r.id);
      }
    }

    // coverage (informational)
    if (valid.length && p.plot.width > 0 && p.plot.depth > 0) {
      const covered = valid.reduce((s, r) => s + rectArea(r), 0);
      const plotArea = p.plot.width * p.plot.depth;
      add("info", "coverage", `${label}: rooms cover ${((covered / plotArea) * 100).toFixed(0)}% of the plot area.`, floor);
    }

    // ---- openings ----
    const wallById = new Map(floor.walls.map((w) => [w.id, w]));
    for (const o of floor.openings) {
      const kind = o.kind === "door" ? "Door" : "Window";
      const wall = wallById.get(o.wallId);
      if (!wall) {
        add("error", "opening-no-wall", `${label}: a ${kind.toLowerCase()} is not attached to any existing wall.`, floor, o.id);
        continue;
      }
      if (!(o.width > 0) || !(o.height > 0)) {
        add("error", "opening-size", `${label}: a ${kind.toLowerCase()} has a zero or negative size.`, floor, o.id);
        continue;
      }
      const len = wallLength(wall);
      if (o.offset < -TOL || o.offset + o.width > len + TOL) {
        add("error", "opening-too-wide", `${label}: a ${kind.toLowerCase()} (${o.width.toFixed(2)} m) does not fit its ${len.toFixed(2)} m wall.`, floor, o.id);
      }
      if (o.sill < 0 || o.sill + o.height > floor.height + TOL) {
        add("error", "opening-too-tall", `${label}: a ${kind.toLowerCase()} is taller than the ${floor.height.toFixed(2)} m floor height.`, floor, o.id);
      }
    }
    const byWall = new Map<string, typeof floor.openings>();
    for (const o of floor.openings) byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o]);
    for (const list of byWall.values()) {
      const sorted = [...list].sort((a, b) => a.offset - b.offset);
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].offset + sorted[i].width > sorted[i + 1].offset + TOL) {
          add("error", "opening-overlap", `${label}: two openings overlap on the same wall.`, floor, sorted[i + 1].id);
        }
      }
    }


    // ---- practical (non-regulatory) comfort checks ----
    const doorsOn = (room: (typeof valid)[number], kind: "door" | "window") =>
      floor.openings.filter((o) => {
        if (o.kind !== kind) return false;
        const w = wallById.get(o.wallId);
        if (!w) return false;
        const g = openingGeometry(w, o);
        return onBoundary(room, { x: (g.p0.x + g.p1.x) / 2, y: (g.p0.y + g.p1.y) / 2 });
      }).length;
    const floorHasDoors = floor.openings.some((o) => o.kind === "door");
    const floorHasWindows = floor.openings.some((o) => o.kind === "window");
    const habitable = ["living", "bedroom", "master-bedroom", "kitchen", "dining", "study", "office", "reception", "meeting-room", "classroom", "ward", "shop", "hall", "laboratory", "workshop"];
    for (const r of floor.rooms.filter(isValidRect)) {
      if (floorHasDoors && doorsOn(r, "door") === 0) add("warning", "room-no-door", `${label}: "${r.name}" has no door, so it cannot be entered.`, floor, r.id);
      if (floorHasWindows && habitable.includes(r.type) && doorsOn(r, "window") === 0)
        add("warning", "room-no-window", `${label}: "${r.name}" has no window (no daylight or ventilation modelled).`, floor, r.id);
      if (r.type !== "custom") {
        const std = DEFAULT_ROOM_SIZES[r.type];
        if (r.width * r.depth < 0.6 * std.width * std.depth)
          add("warning", "room-small", `${label}: "${r.name}" (${(r.width * r.depth).toFixed(1)} m²) is much smaller than the usual starting size for a ${ROOM_TYPE_LABELS[r.type].toLowerCase()} (${(std.width * std.depth).toFixed(1)} m²). Check it is usable.`, floor, r.id);
      }
      const longSide = Math.max(r.width, r.depth);
      const shortSide = Math.min(r.width, r.depth);
      if (!["staircase", "balcony", "garage", "toilet", "bathroom", "lobby", "corridor", "lift", "parking", "pantry", "warehouse", "hall", "classroom", "workshop", "shop"].includes(r.type) && shortSide < longSide / 3)
        add("warning", "room-narrow", `${label}: "${r.name}" is very long and narrow (${longSide.toFixed(1)} x ${shortSide.toFixed(1)} m); furniture layout may be difficult.`, floor, r.id);
    }

    // ---- walls & dimensions ----
    for (const w of floor.walls) {
      if (wallLength(w) < 0.05) add("error", "wall-zero", `${label}: a wall has (almost) zero length.`, floor, w.id);
    }
    for (const d of floor.dimensions) {
      if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 0.01) add("warning", "dimension-zero", `${label}: a dimension has zero length.`, floor, d.id);
    }

    // ---- floor-to-floor consistency ----
    if (floorIndex > 0) {
      const below = p.floors[floorIndex - 1];
      const belowRects = below.rooms.filter(isValidRect);
      for (const r of valid) {
        const over = uncoveredArea(r, belowRects);
        if (over > 0.05) {
          const sev = r.type === "balcony" ? "info" : "warning";
          add(sev, "overhang", `${label}: "${r.name}" overhangs the floor below by ${over.toFixed(2)} m² (structural support must be checked by an engineer).`, floor, r.id);
        }
      }
      const stairs = valid.filter((r) => r.type === "staircase");
      const stairsBelow = below.rooms.filter((q) => q.type === "staircase" && isValidRect(q));
      for (const s of stairs) {
        if (!stairsBelow.some((b) => overlapArea(s, b) > 0.5 * rectArea(s))) {
          add("warning", "stair-misaligned", `${label}: staircase "${s.name}" does not line up with a staircase on ${below.name}.`, floor, s.id);
        }
      }
    }
  });

  if (p.floors.length > 1 && !p.floors.some((f) => f.rooms.some((r) => r.type === "staircase"))) {
    add("warning", "no-stairs", "The building has several floors but no staircase has been added.");
  }
  return issues;
}

export const countBySeverity = (issues: ValidationIssue[]) => ({
  error: issues.filter((i) => i.severity === "error").length,
  warning: issues.filter((i) => i.severity === "warning").length,
  info: issues.filter((i) => i.severity === "info").length,
});
