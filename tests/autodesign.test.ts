import { describe, expect, it } from "vitest";
import { applyOption, DEFAULT_AUTODESIGN_INPUT, generateOptions, type AutoDesignInput } from "@/lib/layout/autodesign";
import { createProject, generateWalls, addRoom, addOpeningOnWall } from "@/lib/model/ops";
import { makeRoom } from "@/lib/model/defaults";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { generateWallsFromRooms } from "@/lib/geometry/walls";
import { sharedSegment } from "@/lib/geometry/adjacency";

const base = (o: Partial<AutoDesignInput>): AutoDesignInput => ({ ...DEFAULT_AUTODESIGN_INPUT, ...o });
const blank = (w: number, d: number, floors: number) =>
  createProject({ name: "t", plotWidth: w, plotDepth: d, floors, buildingType: "custom", unitSystem: "metric", targetBudget: null } as never);

const scenarios: Array<[string, number, number, Partial<AutoDesignInput>]> = [
  ["9x12 one floor 2 bed", 9, 12, { floors: 1, bedrooms: 2 }],
  ["12x18 one floor 3 bed attached bath", 12, 18, { floors: 1, bedrooms: 3, attachedBathMaster: true }],
  ["9x12 two floors 3 bed", 9, 12, { floors: 2, bedrooms: 3 }],
  ["12x15 two floors 4 bed garage", 12, 15, { floors: 2, bedrooms: 4, includeGarage: true }],
  ["10x15 three floors 5 bed", 10, 15, { floors: 3, bedrooms: 5 }],
  ["9x12 front at top with setbacks", 9, 12, { floors: 2, bedrooms: 2, frontSide: "top", setbackFront: 1.5, setbackSide: 1, setbackRear: 1 }],
  ["6x9 one bedroom", 6, 9, { floors: 1, bedrooms: 1 }],
];

describe("auto design", () => {
  for (const [name, w, d, inp] of scenarios) {
    it(`${name}: valid, reachable and aligned`, () => {
      const input = base(inp);
      const res = generateOptions({ width: w, depth: d }, input);
      expect(res.errors).toEqual([]);
      expect(res.options.length).toBeGreaterThan(0);
      for (const o of res.options) {
        const { project, failed } = applyOption(blank(w, d, input.floors), o);
        expect(failed).toEqual([]);
        expect(countBySeverity(validateProject(project)).error).toBe(0);
        // every room has a door
        const issues = validateProject(project);
        expect(issues.filter((i) => i.code === "room-no-door")).toEqual([]);
        // one staircase per floor, in the same place
        if (input.floors > 1) {
          const stairs = project.floors.map((f) => f.rooms.find((r) => r.type === "staircase"));
          for (const s of stairs) expect(s).toBeTruthy();
          for (const s of stairs) {
            expect(s!.x).toBeCloseTo(stairs[0]!.x, 6);
            expect(s!.y).toBeCloseTo(stairs[0]!.y, 6);
          }
        }
        // inside the plot and inside setbacks
        for (const f of project.floors) for (const r of f.rooms) {
          expect(r.x).toBeGreaterThanOrEqual(input.setbackSide - 1e-6);
          expect(r.x + r.width).toBeLessThanOrEqual(w - input.setbackSide + 1e-6);
          expect(r.y).toBeGreaterThanOrEqual((input.frontSide === "top" ? input.setbackFront : input.setbackRear) - 1e-6);
          expect(r.y + r.depth).toBeLessThanOrEqual(d - (input.frontSide === "top" ? input.setbackRear : input.setbackFront) + 1e-6);
        }
        expect(project.floors.length).toBe(input.floors);
      }
    });
  }

  it("is deterministic apart from ids", () => {
    const a = generateOptions({ width: 9, depth: 12 }, base({ floors: 2, bedrooms: 3 }));
    const b = generateOptions({ width: 9, depth: 12 }, base({ floors: 2, bedrooms: 3 }));
    const strip = (r: typeof a) => r.options.map((o) => o.floors.map((f) => f.rooms.map((x) => [x.type, x.x, x.y, x.width, x.depth])));
    expect(strip(a)).toEqual(strip(b));
  });

  it("returns clear errors instead of a broken design", () => {
    const tiny = generateOptions({ width: 4, depth: 5 }, base({ bedrooms: 2 }));
    expect(tiny.options).toEqual([]);
    expect(tiny.errors.length).toBeGreaterThan(0);
    const setbacks = generateOptions({ width: 9, depth: 12 }, base({ setbackSide: 4.5 }));
    expect(setbacks.options).toEqual([]);
    expect(generateOptions({ width: 9, depth: 12 }, base({ floors: 9 })).errors.length).toBe(1);
    expect(generateOptions({ width: 9, depth: 12 }, base({ bedrooms: 0 })).errors.length).toBe(1);
    expect(generateOptions({ width: 9, depth: 12 }, base({ setbackFront: -1 })).errors.length).toBe(1);
  });

  it("replaces the old design and keeps plot and settings", () => {
    const b0 = blank(9, 12, 1);
    const p0 = addRoom(b0, b0.floors[0].id, makeRoom("living", 0, 0));
    const res = generateOptions({ width: 9, depth: 12 }, base({}));
    const { project } = applyOption(p0, res.options[0]);
    expect(project.plot).toEqual(p0.plot);
    expect(project.settings).toEqual(p0.settings);
    expect(project.floors[0].id).toBe(p0.floors[0].id);
    expect(project.floors[0].rooms.some((r) => r.type === "living")).toBe(true);
    expect(p0.floors[0].rooms.length).toBe(1); // original untouched
  });
});

describe("realism helpers", () => {
  it("classifies exterior vs interior walls", () => {
    const rooms = [makeRoom("living", 0, 0, { width: 4, depth: 3 }), makeRoom("kitchen", 4, 0, { width: 3, depth: 3 })];
    const walls = generateWallsFromRooms(rooms, 0.115, 0.23);
    const shared = walls.filter((w) => Math.abs(w.x1 - 4) < 1e-6 && Math.abs(w.x2 - 4) < 1e-6);
    expect(shared.length).toBe(1);
    expect(shared[0].thickness).toBeCloseTo(0.115, 6);
    expect(walls.filter((w) => w !== shared[0]).every((w) => Math.abs(w.thickness - 0.23) < 1e-9)).toBe(true);
  });

  it("finds the shared edge between touching rooms only", () => {
    const a = { x: 0, y: 0, width: 4, depth: 3 };
    expect(sharedSegment(a, { x: 4, y: 1, width: 2, depth: 5 })).toEqual({ orient: "v", fixed: 4, from: 1, to: 3 });
    expect(sharedSegment(a, { x: 5, y: 0, width: 2, depth: 3 })).toBeNull();
  });

  it("addOpeningOnWall refuses overlaps and short walls", () => {
    let p = blank(9, 12, 1);
    const fid = p.floors[0].id;
    p = addRoom(p, fid, makeRoom("living", 0, 0, { width: 4, depth: 3 }));
    p = generateWalls(p, fid);
    const top = p.floors[0].walls.find((w) => w.y1 === 0 && w.y2 === 0)!;
    const r1 = addOpeningOnWall(p, fid, top.id, "door", 2);
    expect("project" in r1).toBe(true);
    if ("project" in r1) {
      const r2 = addOpeningOnWall(r1.project, fid, top.id, "door", 2.2);
      expect("error" in r2).toBe(true);
    }
    expect("error" in addOpeningOnWall(p, fid, top.id, "door", 2, { width: 9 })).toBe(true);
  });
});
