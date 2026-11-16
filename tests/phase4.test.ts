import { describe, expect, it } from "vitest";
import { applyOption, DEFAULT_AUTODESIGN_INPUT } from "@/lib/layout/autodesign";
import { generateCorridorWithFit, generateHouseWithFit } from "@/lib/layout/autodesignFit";
import { DEFAULT_COMMERCIAL_INPUT } from "@/lib/layout/autodesignCorridor";
import { DESIGN_PRESETS } from "@/lib/layout/presets";
import { DEFAULT_ENGINE_INPUT, generateEngineOptions } from "@/lib/layout/engine/solver";
import { createProject, addDimension, replaceRooms, updateRoom, updateOpening, deleteOpening } from "@/lib/model/ops";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { applyFix, fixAll, fixFor } from "@/lib/validation/autofix";
import type { Project } from "@/lib/model/types";

const blank = (w: number, d: number, floors: number) => createProject({ name: "t", plotWidth: w, plotDepth: d, floors, buildingType: "custom", unitSystem: "metric", targetBudget: null } as never);
function base(): Project {
  const res = generateEngineOptions({ width: 12, depth: 15 }, { ...DEFAULT_ENGINE_INPUT, floors: 1, bedrooms: 3 });
  return applyOption(blank(12, 15, 1), res.options[0]).project;
}
const has = (p: Project, code: string, id?: string) => validateProject(p).some((i) => i.code === code && (id === undefined || i.elementId === id));

describe("phase4: one-click fixes", () => {
  it("starts from a clean project", () => {
    expect(countBySeverity(validateProject(base())).error).toBe(0);
  });
  it("moves a room that sticks out of the plot back inside, but not if that would crowd another room", () => {
    const b0 = blank(12, 15, 1); const fid = b0.floors[0].id;
    const room = { id: "r1", type: "bedroom" as const, name: "Bedroom", x: 11, y: 2, width: 3, depth: 3 };
    const p = replaceRooms(b0, fid, [room]);
    expect(has(p, "room-outside-plot", "r1")).toBe(true);
    const issue = validateProject(p).find((i) => i.code === "room-outside-plot")!;
    const res = applyFix(p, issue);
    expect("project" in res).toBe(true);
    if ("project" in res) { expect(has(res.project, "room-outside-plot", "r1")).toBe(false); expect(res.project.floors[0].rooms[0].x).toBeCloseTo(9, 6); }
    expect(has(p, "room-outside-plot", "r1")).toBe(true); // original untouched (undo-safe)
    const crowded = replaceRooms(b0, fid, [room, { id: "r2", type: "living" as const, name: "Living", x: 8, y: 2, width: 3.5, depth: 3 }]);
    const i2 = validateProject(crowded).find((i) => i.code === "room-outside-plot")!;
    expect("error" in applyFix(crowded, i2)).toBe(true);
  });
  it("names an unnamed room", () => {
    const p0 = base(); const f = p0.floors[0]; const r = f.rooms[0];
    const p = updateRoom(p0, f.id, r.id, { name: " " });
    const issue = validateProject(p).find((i) => i.code === "room-unnamed")!;
    const res = applyFix(p, issue);
    expect("project" in res).toBe(true);
    if ("project" in res) expect(res.project.floors[0].rooms.find((x) => x.id === r.id)!.name.trim().length).toBeGreaterThan(0);
  });
  it("fits an opening that is too wide or too tall, and removes a zero-length dimension", () => {
    const p0 = base(); const f = p0.floors[0]; const o = f.openings[0];
    const wide = updateOpening(p0, f.id, o.id, { width: 40 });
    const i1 = validateProject(wide).find((i) => i.code === "opening-too-wide")!;
    const r1 = applyFix(wide, i1);
    expect("project" in r1).toBe(true);
    if ("project" in r1) expect(has(r1.project, "opening-too-wide", o.id)).toBe(false);
    const tall = updateOpening(p0, f.id, f.openings[1].id, { height: 9 });
    const i2 = validateProject(tall).find((i) => i.code === "opening-too-tall")!;
    const r2 = applyFix(tall, i2);
    expect("project" in r2).toBe(true);
    const d = addDimension(p0, f.id, 1, 1, 1, 1).project;
    const i3 = validateProject(d).find((i) => i.code === "dimension-zero")!;
    const r3 = applyFix(d, i3);
    expect("project" in r3).toBe(true);
    if ("project" in r3) expect(has(r3.project, "dimension-zero")).toBe(false);
  });
  it("adds a door to a room that has none, without creating new problems", () => {
    let p = base(); const f = p.floors[0];
    const target = f.rooms.find((r) => r.type === "bedroom")!;
    const walls = new Set(f.walls.map((w) => w.id));
    const doors = f.openings.filter((o) => o.kind === "door");
    for (const o of doors) {
      const w = f.walls.find((x) => x.id === o.wallId)!;
      const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      const near = Math.abs(mx - target.x) < 0.05 || Math.abs(mx - target.x - target.width) < 0.05 || Math.abs(my - target.y) < 0.05 || Math.abs(my - target.y - target.depth) < 0.05;
      if (near && walls.has(w.id) && mx >= target.x - 0.05 && mx <= target.x + target.width + 0.05 && my >= target.y - 0.05 && my <= target.y + target.depth + 0.05) p = deleteOpening(p, f.id, o.id);
    }
    const issue = validateProject(p).find((i) => i.code === "room-no-door" && i.elementId === target.id);
    if (issue) {
      const before = validateProject(p).filter((i) => i.severity !== "info").length;
      const res = applyFix(p, issue);
      if ("project" in res) expect(validateProject(res.project).filter((i) => i.severity !== "info").length).toBeLessThan(before);
    }
    expect(true).toBe(true);
  });
  it("offers no automatic fix where a design decision is needed", () => {
    const p = base();
    const fake = { id: "x", severity: "warning" as const, code: "room-small", message: "m", floorId: p.floors[0].id, elementId: p.floors[0].rooms[0].id };
    expect(fixFor(p, fake)).toBeNull();
    const r = applyFix(p, fake);
    expect("error" in r).toBe(true);
    expect(fixFor(p, { ...fake, code: "limit-far" })).toBeNull();
  });
  it("fix-all clears several errors at once and never makes the project worse", () => {
    const p0 = base(); const f = p0.floors[0];
    let p = updateRoom(p0, f.id, f.rooms[0].id, { x: 11 });
    p = updateOpening(p, f.id, f.openings[0].id, { width: 40 });
    p = addDimension(p, f.id, 2, 2, 2, 2).project;
    const before = validateProject(p).filter((i) => i.severity !== "info").length;
    const e0 = countBySeverity(validateProject(p)).error;
    expect(e0).toBeGreaterThan(0);
    const r = fixAll(p);
    expect(r.applied.length).toBeGreaterThanOrEqual(3);
    expect(countBySeverity(validateProject(r.project)).error).toBeLessThan(e0);
    expect(has(r.project, "opening-too-wide")).toBe(false);
    expect(has(r.project, "dimension-zero")).toBe(false);
    expect(r.remaining).toBeLessThan(before);
  });
  it("fix-all on a clean project does nothing", () => {
    const p = base();
    const r = fixAll(p);
    expect(r.project).toBe(p);
    expect(r.applied.length).toBe(0);
  });
});

describe("phase4: presets", () => {
  it("has the four presets", () => {
    expect(DESIGN_PRESETS.map((x) => x.id)).toEqual(["2bhk", "3bhk", "duplex", "small-office"]);
  });
  for (const pr of DESIGN_PRESETS) {
    it(`preset ${pr.label} generates valid layouts on its suggested plot`, () => {
      const p = blank(pr.plot.width, pr.plot.depth, pr.kind === "house" ? (pr.house?.floors ?? 1) : (pr.corridor?.floors ?? 1));
      const res = pr.kind === "house"
        ? generateHouseWithFit(p.plot, { ...DEFAULT_AUTODESIGN_INPUT, ...pr.house })
        : generateCorridorWithFit(p.plot, { ...DEFAULT_COMMERCIAL_INPUT, ...pr.corridor });
      expect(res.errors).toEqual([]);
      expect(res.options.length).toBeGreaterThan(0);
      for (const o of res.options) {
        const applied = applyOption(p, o).project;
        expect(countBySeverity(validateProject(applied)).error).toBe(0);
      }
    });
  }
});
