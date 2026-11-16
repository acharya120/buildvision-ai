import type { Floor, Project, ValidationIssue } from "../model/types";
import { isInsidePlot, isValidRect, overlapArea, type Rect } from "../geometry/rect";
import { onBoundary } from "../geometry/adjacency";
import { wallLength } from "../geometry/walls";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { addOpeningOnWall, deleteDimension, deleteOpening, deleteWall, generateWalls, updateOpening, updateRoom } from "../model/ops";
import { validateProject } from "./validate";

/**
 * One-click fixes for the geometry checks. A fix is offered only where a safe, obvious repair exists, and it is only
 * accepted if re-checking the project shows the problem gone and nothing new (no extra errors or warnings).
 * Checks that need a design decision (room too small, overhang, stair alignment, limits) get no button.
 * These are geometry repairs only, not a building-code or structural check.
 */
export interface FixInfo {
  /** short text for the button, says what will change */
  label: string;
  /** returns the repaired project, or null if the repair is not possible */
  run: (p: Project) => Project | null;
}

const mid = (w: { x1: number; y1: number; x2: number; y2: number }) => ({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
const floorOf = (p: Project, id?: string): Floor | undefined => p.floors.find((f) => f.id === id);

function addOnRoom(p: Project, floor: Floor, roomId: string, kind: "door" | "window"): Project | null {
  const room = floor.rooms.find((r) => r.id === roomId);
  if (!room || !isValidRect(room)) return null;
  const others = floor.rooms.filter((r) => r.id !== roomId && isValidRect(r));
  const cands = floor.walls
    .filter((w) => onBoundary(room, mid(w)) && wallLength(w) >= (kind === "door" ? 1.1 : 1.0))
    .map((w) => ({ w, shared: others.some((o) => onBoundary(o, mid(w))) }))
    .filter((c) => (kind === "door" ? c.shared : !c.shared))
    .sort((a, b) => wallLength(b.w) - wallLength(a.w));
  for (const c of cands) {
    const r = addOpeningOnWall(p, floor.id, c.w.id, kind, wallLength(c.w) / 2);
    if (!("error" in r)) return r.project;
  }
  return null;
}

export function fixFor(p: Project, issue: ValidationIssue): FixInfo | null {
  const floor = floorOf(p, issue.floorId);
  const id = issue.elementId;
  switch (issue.code) {
    case "room-unnamed": {
      const r = floor?.rooms.find((x) => x.id === id);
      if (!floor || !r) return null;
      return { label: `Name it "${ROOM_TYPE_LABELS[r.type]}"`, run: (q) => updateRoom(q, floor.id, r.id, { name: ROOM_TYPE_LABELS[r.type] }) };
    }
    case "room-outside-plot": {
      const r = floor?.rooms.find((x) => x.id === id);
      if (!floor || !r || !isValidRect(r)) return null;
      return {
        label: "Move it inside the plot",
        run: (q) => {
          const w = Math.min(r.width, q.plot.width), d = Math.min(r.depth, q.plot.depth);
          const x = Math.min(Math.max(0, r.x), q.plot.width - w), y = Math.min(Math.max(0, r.y), q.plot.depth - d);
          const next: Rect = { x, y, width: w, depth: d };
          if (!isInsidePlot(next, q.plot)) return null;
          const others = floorOf(q, floor.id)!.rooms.filter((o) => o.id !== r.id && isValidRect(o));
          const ov = (rc: Rect) => others.reduce((t, o) => t + overlapArea(rc, o), 0);
          if (ov(next) > ov(r) + 1e-6) return null; // moving inside would crowd another room: leave it to the user
          let out = updateRoom(q, floor.id, r.id, next);
          if (floorOf(out, floor.id)!.walls.length > 0) out = generateWalls(out, floor.id);
          return out;
        },
      };
    }
    case "opening-no-wall":
    case "opening-size":
      return floor && id ? { label: "Remove this opening", run: (q) => deleteOpening(q, floor.id, id) } : null;
    case "opening-overlap":
      return floor && id ? { label: "Remove the overlapping opening", run: (q) => deleteOpening(q, floor.id, id) } : null;
    case "opening-too-wide": {
      const o = floor?.openings.find((x) => x.id === id);
      const w = floor?.walls.find((x) => x.id === o?.wallId);
      if (!floor || !o || !w) return null;
      const len = wallLength(w);
      if (len < 0.7) return null;
      return { label: "Fit it to its wall", run: (q) => updateOpening(q, floor.id, o.id, { width: Math.round(Math.min(o.width, len - 0.2) * 1000) / 1000, offset: Math.round(Math.max(0.1, Math.min(o.offset, len - 0.1 - Math.min(o.width, len - 0.2))) * 1000) / 1000 }) };
    }
    case "opening-too-tall": {
      const o = floor?.openings.find((x) => x.id === id);
      if (!floor || !o) return null;
      return {
        label: "Shorten it to the floor height",
        run: (q) => {
          const sill = Math.max(0, Math.min(o.sill, floor.height - 0.6));
          const height = Math.round(Math.min(o.height, floor.height - sill - 0.05) * 1000) / 1000;
          return height > 0.4 ? updateOpening(q, floor.id, o.id, { sill, height }) : null;
        },
      };
    }
    case "wall-zero":
      return floor && id ? { label: "Remove this wall", run: (q) => deleteWall(q, floor.id, id) } : null;
    case "dimension-zero":
      return floor && id ? { label: "Remove this dimension", run: (q) => deleteDimension(q, floor.id, id) } : null;
    case "room-no-door":
      return floor && id ? { label: "Add a door", run: (q) => addOnRoom(q, floorOf(q, floor.id)!, id, "door") } : null;
    case "room-no-window":
      return floor && id ? { label: "Add a window on an outside wall", run: (q) => addOnRoom(q, floorOf(q, floor.id)!, id, "window") } : null;
    default:
      return null;
  }
}

const score = (list: ValidationIssue[]) => list.filter((i) => i.severity !== "info").length;
const errors = (list: ValidationIssue[]) => list.filter((i) => i.severity === "error").length;
const same = (a: ValidationIssue, b: ValidationIssue) => a.code === b.code && a.elementId === b.elementId && a.floorId === b.floorId;

/** Applies one fix and returns the new project only if it really helped and made nothing worse. */
export function applyFix(p: Project, issue: ValidationIssue): { project: Project } | { error: string } {
  const fix = fixFor(p, issue);
  if (!fix) return { error: "This check has no automatic fix. It needs your decision." };
  const next = fix.run(p);
  if (!next) return { error: "A safe automatic fix was not possible here. Please adjust it by hand." };
  const before = validateProject(p), after = validateProject(next);
  if (after.some((i) => same(i, issue))) return { error: "The fix did not clear this check, so nothing was changed." };
  if (errors(after) > errors(before) || score(after) > score(before)) return { error: "The fix would cause another problem, so nothing was changed." };
  return { project: next };
}

/** Repeats applyFix for every fixable check (errors first). Stops when nothing more can be fixed safely. */
export function fixAll(p: Project, maxSteps = 80): { project: Project; applied: string[]; remaining: number } {
  let cur = p;
  const applied: string[] = [];
  const skip = new Set<string>();
  for (let step = 0; step < maxSteps; step++) {
    const issues = validateProject(cur).filter((i) => i.severity !== "info" && !skip.has(`${i.code}|${i.floorId}|${i.elementId}`));
    issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
    let progressed = false;
    for (const i of issues) {
      const key = `${i.code}|${i.floorId}|${i.elementId}`;
      const fix = fixFor(cur, i);
      if (!fix) { skip.add(key); continue; }
      const r = applyFix(cur, i);
      if ("error" in r) { skip.add(key); continue; }
      cur = r.project; applied.push(fix.label + ": " + i.message); progressed = true;
      break;
    }
    if (!progressed) break;
  }
  return { project: cur, applied, remaining: validateProject(cur).filter((i) => i.severity !== "info").length };
}
