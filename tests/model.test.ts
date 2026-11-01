import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/model/types";
import {
  addDimension,
  addFloor,
  addOpeningNear,
  addRoom,
  createProject,
  deleteRoom,
  findFreeSpot,
  generateWalls,
  moveRoom,
  removeFloor,
  resetDesign,
  resizeRoom,
  setPlot,
  totalRoomArea,
  updateRoom,
  validateNewProject,
} from "@/lib/model/ops";
import { makeRoom } from "@/lib/model/defaults";
import { SAMPLES } from "@/lib/model/samples";
import { parseProject, parseProjectJson, serializeProject } from "@/lib/model/schema";
import { validateProject } from "@/lib/validation/validate";
import { buildEstimate } from "@/lib/estimate/estimate";
import { arrangeRooms } from "@/lib/layout/arrange";
import { interpret } from "@/lib/assistant/rules";
import { roomScheduleCsv, estimateCsv } from "@/lib/export/csv";
import { planToSvg } from "@/lib/export/svg";
import { buildElevation, buildSection } from "@/lib/export/drawings";
import { buildObj } from "@/lib/export/obj";

const base = (): Project =>
  createProject({ name: "T", plotWidth: 10, plotDepth: 8, unitSystem: "metric", buildingType: "single-floor", floors: 1 });

const withRoom = (p: Project, x: number, y: number, w: number, d: number, name = "R") => {
  const room = makeRoom("custom", x, y, { width: w, depth: d }, name);
  return { project: addRoom(p, p.floors[0].id, room), room };
};

describe("project creation & input validation", () => {
  it("creates floors with stable unique ids", () => {
    const p = createProject({ name: "A", plotWidth: 5, plotDepth: 5, unitSystem: "metric", buildingType: "duplex", floors: 3 });
    expect(p.floors).toHaveLength(3);
    expect(new Set(p.floors.map((f) => f.id)).size).toBe(3);
    expect(p.floors.map((f) => f.name)).toEqual(["Ground Floor", "First Floor", "Second Floor"]);
  });
  it("rejects invalid dimensions with readable messages", () => {
    const ok = { name: "x", plotWidth: 5, plotDepth: 5, unitSystem: "metric" as const, buildingType: "single-floor" as const, floors: 1 };
    expect(validateNewProject(ok)).toEqual([]);
    expect(validateNewProject({ ...ok, plotWidth: 0 })[0]).toMatch(/greater than zero/);
    expect(validateNewProject({ ...ok, plotDepth: -2 })[0]).toMatch(/greater than zero/);
    expect(validateNewProject({ ...ok, plotWidth: 6000 })[0]).toMatch(/unreasonably large/);
    expect(validateNewProject({ ...ok, plotWidth: NaN })[0]).toMatch(/must be a number/);
    expect(validateNewProject({ ...ok, name: "  " })[0]).toMatch(/project name/i);
    expect(validateNewProject({ ...ok, floors: 0 }).length).toBe(1);
    expect(validateNewProject({ ...ok, floors: 2.5 }).length).toBe(1);
    expect(validateNewProject({ ...ok, targetBudget: -1 }).length).toBe(1);
  });
});

describe("room editing keeps geometry and schedule in sync", () => {
  it("moves and resizes a room and recalculates area", () => {
    const { project, room } = withRoom(base(), 1, 1, 3, 2);
    const fid = project.floors[0].id;
    expect(totalRoomArea(project.floors[0])).toBeCloseTo(6, 9);
    const moved = moveRoom(project, fid, room.id, 4, 3);
    expect(moved.floors[0].rooms[0]).toMatchObject({ x: 4, y: 3, width: 3, depth: 2 });
    const resized = resizeRoom(moved, fid, room.id, 5, 4);
    expect(resized.floors[0].rooms[0]).toMatchObject({ width: 5, depth: 4 });
    expect(totalRoomArea(resized.floors[0])).toBeCloseTo(20, 9);
  });
  it("is immutable: the original project is untouched", () => {
    const { project, room } = withRoom(base(), 0, 0, 2, 2);
    updateRoom(project, project.floors[0].id, room.id, { width: 9 });
    expect(project.floors[0].rooms[0].width).toBe(2);
  });
  it("deletes rooms", () => {
    const { project, room } = withRoom(base(), 0, 0, 2, 2);
    expect(deleteRoom(project, project.floors[0].id, room.id).floors[0].rooms).toHaveLength(0);
  });
  it("finds a free spot that does not overlap, or null when full", () => {
    const { project } = withRoom(base(), 0, 0, 10, 4);
    const spot = findFreeSpot(project, project.floors[0].id, 3, 3);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(findFreeSpot(project, project.floors[0].id, 11, 3)).toBeNull();
  });
  it("never silently alters rooms when the plot shrinks", () => {
    const { project } = withRoom(base(), 5, 0, 5, 5);
    const smaller = setPlot(project, 6, 6);
    expect(smaller.floors[0].rooms[0]).toMatchObject({ x: 5, width: 5 });
    expect(validateProject(smaller).some((i) => i.code === "room-outside-plot")).toBe(true);
  });
  it("adds and removes floors but keeps at least one", () => {
    const p = base();
    const added = addFloor(p)!;
    expect(added.project.floors).toHaveLength(2);
    expect(removeFloor(added.project, added.floorId).floors).toHaveLength(1);
    expect(removeFloor(p, p.floors[0].id).floors).toHaveLength(1);
  });
  it("resets the design but keeps plot and floors", () => {
    const { project } = withRoom(base(), 0, 0, 2, 2);
    const r = resetDesign(generateWalls(project, project.floors[0].id));
    expect(r.floors[0].rooms).toHaveLength(0);
    expect(r.floors[0].walls).toHaveLength(0);
    expect(r.plot).toEqual(project.plot);
  });
});

describe("validation", () => {
  it("flags rooms outside the plot", () => {
    const { project } = withRoom(base(), 8, 0, 4, 2, "Big");
    const issues = validateProject(project);
    expect(issues.find((i) => i.code === "room-outside-plot")?.severity).toBe("error");
  });
  it("flags overlaps but not touching rooms", () => {
    let p = withRoom(base(), 0, 0, 4, 4, "A").project;
    p = withRoom(p, 4, 0, 4, 4, "B").project;
    expect(validateProject(p).some((i) => i.code === "room-overlap")).toBe(false);
    p = withRoom(p, 3, 1, 2, 2, "C").project;
    expect(validateProject(p).filter((i) => i.code === "room-overlap").length).toBeGreaterThanOrEqual(1);
  });
  it("can allow overlap by setting", () => {
    let p = withRoom(base(), 0, 0, 4, 4).project;
    p = withRoom(p, 1, 1, 4, 4).project;
    p = { ...p, settings: { ...p.settings, allowOverlap: true } };
    expect(validateProject(p).some((i) => i.code === "room-overlap")).toBe(false);
  });
  it("flags zero-sized and negative rooms as errors", () => {
    let p = withRoom(base(), 0, 0, 0, 3, "Zero").project;
    p = withRoom(p, 5, 5, -2, 2, "Neg").project;
    expect(validateProject(p).filter((i) => i.code === "room-invalid")).toHaveLength(2);
  });
  it("reports gaps only when adjoining is required, and as warnings", () => {
    let p = withRoom(base(), 0, 0, 3, 3, "A").project;
    p = withRoom(p, 6, 5, 3, 3, "B").project;
    expect(validateProject(p).some((i) => i.code === "room-isolated")).toBe(false);
    p = { ...p, settings: { ...p.settings, requireAdjoining: true } };
    const iso = validateProject(p).filter((i) => i.code === "room-isolated");
    expect(iso).toHaveLength(2);
    expect(iso.every((i) => i.severity === "warning")).toBe(true);
  });
  it("flags openings that do not fit, overlap, or have no wall", () => {
    let p = withRoom(base(), 0, 0, 4, 4).project;
    const fid = p.floors[0].id;
    p = generateWalls(p, fid);
    const wall = p.floors[0].walls.find((w) => w.y1 === 0 && w.y2 === 0)!;
    const mk = (id: string, offset: number, width: number, height = 2.1, sill = 0) => ({
      id, wallId: wall.id, kind: "door" as const, offset, width, height, sill,
    });
    const fl = p.floors[0];
    const tooWide = { ...p, floors: [{ ...fl, openings: [mk("a", 3.5, 1)] }] };
    expect(validateProject(tooWide).some((i) => i.code === "opening-too-wide")).toBe(true);
    const tooTall = { ...p, floors: [{ ...fl, openings: [mk("a", 1, 1, 3.5)] }] };
    expect(validateProject(tooTall).some((i) => i.code === "opening-too-tall")).toBe(true);
    const overlap = { ...p, floors: [{ ...fl, openings: [mk("a", 1, 1), mk("b", 1.5, 1)] }] };
    expect(validateProject(overlap).some((i) => i.code === "opening-overlap")).toBe(true);
    const orphan = { ...p, floors: [{ ...fl, openings: [{ ...mk("a", 1, 1), wallId: "nope" }] }] };
    expect(validateProject(orphan).some((i) => i.code === "opening-no-wall")).toBe(true);
    const fine = { ...p, floors: [{ ...fl, openings: [mk("a", 1, 1), mk("b", 2.2, 1)] }] };
    expect(validateProject(fine).filter((i) => i.severity === "error")).toHaveLength(0);
  });
  it("warns about upper-floor overhang and missing stairs", () => {
    let p = createProject({ name: "D", plotWidth: 10, plotDepth: 10, unitSystem: "metric", buildingType: "duplex", floors: 2 });
    p = addRoom(p, p.floors[0].id, makeRoom("living", 0, 0, { width: 4, depth: 4 }));
    p = addRoom(p, p.floors[1].id, makeRoom("bedroom", 2, 0, { width: 4, depth: 4 }, "Upper"));
    const codes = validateProject(p).map((i) => i.code);
    expect(codes).toContain("overhang");
    expect(codes).toContain("no-stairs");
  });
});

describe("openings", () => {
  it("places an opening on the nearest wall and reports errors when too far", () => {
    let p = withRoom(base(), 0, 0, 4, 4).project;
    const fid = p.floors[0].id;
    p = generateWalls(p, fid);
    const ok = addOpeningNear(p, fid, "door", 2, 0.05);
    expect("project" in ok).toBe(true);
    const far = addOpeningNear(p, fid, "door", 2, 2);
    expect("error" in far).toBe(true);
  });
  it("keeps openings attached when walls are regenerated after a room resize", () => {
    let p = withRoom(base(), 0, 0, 4, 4).project;
    const fid = p.floors[0].id;
    p = generateWalls(p, fid);
    const res = addOpeningNear(p, fid, "window", 2, 0)!;
    if (!("project" in res)) throw new Error("expected placement");
    p = res.project;
    p = resizeRoom(p, fid, p.floors[0].rooms[0].id, 6, 4);
    p = generateWalls(p, fid);
    const o = p.floors[0].openings[0];
    expect(p.floors[0].walls.some((w) => w.id === o.wallId)).toBe(true);
    expect(validateProject(p).some((i) => i.code === "opening-no-wall")).toBe(false);
  });
});

describe("serialization & import validation", () => {
  it("round-trips every sample project and keeps them free of validation errors", () => {
    for (const s of SAMPLES) {
      const p = s.build();
      expect(validateProject(p).filter((i) => i.severity === "error")).toEqual([]);
      const back = parseProjectJson(serializeProject(p));
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.project).toEqual(p);
    }
  });
  it("accepts a bare project object too", () => {
    expect(parseProject(JSON.parse(JSON.stringify(base()))).ok).toBe(true);
  });
  it("rejects malformed files with clear messages", () => {
    const bad = (v: unknown) => {
      const r = parseProject(v);
      expect(r.ok).toBe(false);
      return r.ok ? [] : r.errors;
    };
    expect(parseProjectJson("{not json").ok).toBe(false);
    expect(bad(null)[0]).toMatch(/does not contain/);
    expect(bad([])[0]).toMatch(/does not contain/);
    expect(bad({})).not.toHaveLength(0);
    const p = JSON.parse(JSON.stringify(base()));
    expect(bad({ ...p, schemaVersion: 99 })[0]).toMatch(/newer version/);
    expect(bad({ ...p, unitSystem: "cubits" }).join(" ")).toMatch(/unitSystem/);
    expect(bad({ ...p, plot: { width: -3, depth: 5 } }).join(" ")).toMatch(/plot/);
    expect(bad({ ...p, floors: [] }).join(" ")).toMatch(/floors/);
    const withBadRoom = JSON.parse(JSON.stringify(base()));
    withBadRoom.floors[0].rooms = [{ id: "r", name: "x", type: "castle", x: 0, y: 0, width: "wide", depth: 2 }];
    expect(bad(withBadRoom).join(" ")).toMatch(/width|room type/);
    const dup = JSON.parse(JSON.stringify(base()));
    const room = { id: "same", name: "A", type: "custom", x: 0, y: 0, width: 1, depth: 1 };
    dup.floors[0].rooms = [room, { ...room }];
    expect(bad(dup).join(" ")).toMatch(/duplicate id/i);
  });
  it("rejects oversized files", () => {
    expect(parseProjectJson("x".repeat(6 * 1024 * 1024)).ok).toBe(false);
  });
});

describe("estimate", () => {
  it("calculates quantities from the model and applies only user rates", () => {
    let p = withRoom(base(), 0, 0, 4, 3).project;
    const fid = p.floors[0].id;
    p = generateWalls(p, fid);
    const e = buildEstimate(p);
    const get = (k: string) => e.lines.find((l) => l.key === k)!;
    expect(get("plot-area").quantity).toBeCloseTo(80, 6);
    expect(get("built-up-area").quantity).toBeCloseTo(12, 6);
    expect(get("flooring").quantity).toBeCloseTo(12, 6);
    expect(get("wall-length").quantity).toBeCloseTo(14, 6);
    expect(get("wall-gross").quantity).toBeCloseTo(14 * 3, 6);
    expect(get("plaster").quantity).toBeCloseTo(14 * 3 * 2, 6);
    expect(get("masonry").quantity).toBeCloseTo(14 * 3 * 0.23, 6);
    expect(get("slab-concrete").quantity).toBeCloseTo(12 * 0.125, 6);
    // no rates entered: nothing is priced, nothing invented
    expect(e.totalCost).toBe(0);
    expect(e.lines.every((l) => l.rate === null && l.amount === null)).toBe(true);
    expect(e.unrated).toContain("Flooring");
  });
  it("amount = quantity x rate and the budget difference is reported", () => {
    let p = withRoom(base(), 0, 0, 4, 3).project;
    p = { ...p, rates: { flooring: 1000 }, targetBudget: 20000 };
    const e = buildEstimate(p);
    expect(e.lines.find((l) => l.key === "flooring")!.amount).toBe(12000);
    expect(e.totalCost).toBe(12000);
    expect(e.budgetRemaining).toBe(8000);
  });
  it("deducts openings from wall areas", () => {
    let p = withRoom(base(), 0, 0, 4, 4).project;
    const fid = p.floors[0].id;
    p = generateWalls(p, fid);
    const before = buildEstimate(p).lines.find((l) => l.key === "wall-net")!.quantity;
    const res = addOpeningNear(p, fid, "door", 2, 0)!;
    if (!("project" in res)) throw new Error("expected placement");
    const after = buildEstimate(res.project).lines.find((l) => l.key === "wall-net")!.quantity;
    expect(before - after).toBeCloseTo(0.9 * 2.1, 6);
  });
  it("tells the user when walls are missing and lists what it cannot estimate", () => {
    const p = withRoom(base(), 0, 0, 4, 4).project;
    const e = buildEstimate(p);
    expect(e.unavailable.join(" ")).toMatch(/Generate walls/);
    expect(e.unavailable.join(" ")).toMatch(/Foundations/);
  });
  it("covers every floor", () => {
    const p = SAMPLES[0].build();
    const e = buildEstimate(p);
    expect(e.floors).toHaveLength(2);
    expect(e.floors[0].roomArea).toBeGreaterThan(0);
  });
});

describe("layout assistance", () => {
  it("packs rooms inside the plot without overlap and reports what does not fit", () => {
    const p = base();
    const rooms = [
      makeRoom("living", 0, 0, { width: 4, depth: 4 }, "A"),
      makeRoom("bedroom", 0, 0, { width: 4, depth: 3 }, "B"),
      makeRoom("kitchen", 0, 0, { width: 3, depth: 3 }, "C"),
    ];
    const res = arrangeRooms(rooms, p.plot);
    expect(res.unplaced).toEqual([]);
    const q = { ...p, floors: [{ ...p.floors[0], rooms: res.rooms }] };
    expect(validateProject(q).filter((i) => i.severity === "error")).toEqual([]);
    const tooBig = arrangeRooms([makeRoom("garage", 0, 0, { width: 12, depth: 3 }, "Huge")], p.plot);
    expect(tooBig.unplaced).toEqual(["Huge"]);
  });
});

describe("rule-based assistant", () => {
  const p = SAMPLES[1].build();
  const fid = p.floors[0].id;
  it("adds a room to a named floor when there is free space", () => {
    const roomy = createProject({ name: "R", plotWidth: 12, plotDepth: 10, unitSystem: "metric", buildingType: "duplex", floors: 2 });
    const r = interpret("Add a bedroom to the first floor", roomy, roomy.floors[0].id);
    expect(r.kind).toBe("edit");
    const next = r.apply!(roomy);
    expect(next.floors[1].rooms).toHaveLength(1);
    expect(next.floors[0].rooms).toHaveLength(0);
    expect(validateProject(next).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("does not offer an edit when the floor has no free space", () => {
    const r = interpret("Add a bedroom to the first floor", p, fid); // sample first floor is fully packed
    expect(r.kind).toBe("edit");
    expect(r.apply).toBeUndefined();
    expect(r.message).toMatch(/no free/i);
  });
  it("changes the plot size in feet", () => {
    const r = interpret("Change the plot to 25 by 40 feet", p, fid);
    expect(r.kind).toBe("edit");
    const next = r.apply!(p);
    expect(next.plot.width).toBeCloseTo(25 * 0.3048, 6);
    expect(next.plot.depth).toBeCloseTo(40 * 0.3048, 6);
    expect(r.warnings.length).toBeGreaterThan(0); // 30ft rooms no longer fit
  });
  it("widens a room and warns about new overlaps", () => {
    const r = interpret("Make the kitchen wider", p, fid);
    expect(r.kind).toBe("edit");
    const next = r.apply!(p);
    const before = p.floors[0].rooms.find((x) => x.type === "kitchen")!;
    const after = next.floors[0].rooms.find((x) => x.type === "kitchen")!;
    expect(after.width).toBeCloseTo(before.width + 0.5, 2); // stored rounded to 1 mm
    expect(r.warnings.length).toBeGreaterThan(0); // the sample kitchen is hemmed in by other rooms
  });
  it("answers questions without editing", () => {
    expect(interpret("Show me the total room area", p, fid).kind).toBe("answer");
    expect(interpret("Estimate the flooring material", p, fid).message).toMatch(/Flooring area/);
  });
  it("admits when it does not understand", () => {
    const r = interpret("design me a palace", p, fid);
    expect(r.kind).toBe("unknown");
    expect(r.apply).toBeUndefined();
  });
});

describe("exports are real data derived from the model", () => {
  const p = SAMPLES[0].build();
  it("room schedule CSV has one row per room and escapes safely", () => {
    const rows = roomScheduleCsv(p).trim().split("\r\n");
    const count = p.floors.reduce((s, f) => s + f.rooms.length, 0);
    expect(rows).toHaveLength(count + 1);
    const risky = { ...p, floors: [{ ...p.floors[0], rooms: [{ ...p.floors[0].rooms[0], name: '=HYPERLINK("x"),"y"' }] }] };
    expect(roomScheduleCsv(risky)).toContain("\"'=HYPERLINK(");
  });
  it("estimate CSV contains the not-estimated list and caveat", () => {
    const csv = estimateCsv(p);
    expect(csv).toMatch(/Foundations/);
    expect(csv).toMatch(/not verified quotations/);
  });
  it("SVG floor plan contains dimensions, rooms, scale bar, title block and escaped names", () => {
    const risky = { ...p, name: "<script>alert(1)</script>" };
    const svg = planToSvg(risky, p.floors[0].id);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Plot width");
    expect(svg).toContain("Living");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
  it("elevations and sections carry geometry", () => {
    const e = buildElevation(SAMPLES[1].build(), "south");
    expect(e.rects.some((r) => r.kind === "wall")).toBe(true);
    expect(e.height).toBeCloseTo(6, 6);
    const s = buildSection(SAMPLES[1].build(), "y", 6);
    expect(s.rects.some((r) => r.kind === "room")).toBe(true);
    expect(s.rects.some((r) => r.kind === "cut-wall")).toBe(true);
  });
  it("OBJ export has vertices and faces", () => {
    const obj = buildObj(p);
    expect(obj.match(/^v /gm)!.length).toBeGreaterThan(100);
    expect(obj.match(/^f /gm)!.length).toBeGreaterThan(100);
  });
  it("dimension helper stores a measured line on the right floor", () => {
    const b = base();
    const q = addDimension(b, b.floors[0].id, 0, 0, 3, 4);
    expect(q.project.floors[0].dimensions).toHaveLength(1);
    expect(q.project.floors[0].dimensions[0]).toMatchObject({ x2: 3, y2: 4 });
    expect(b.floors[0].dimensions).toHaveLength(0);
  });
});
