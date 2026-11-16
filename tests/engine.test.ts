import { describe, expect, it } from "vitest";
import { applyOption } from "@/lib/layout/autodesign";
import { createProject } from "@/lib/model/ops";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { checkZoning, computeEnvelope, maxFloorsByFar } from "@/lib/layout/engine/envelope";
import { columnLines, columnPoints, floorToSpan, gridAlignment, snapToSpan, validateGrid } from "@/lib/layout/engine/grid";
import { analyseWetWalls } from "@/lib/layout/engine/wetwall";
import { checkCirculation } from "@/lib/layout/engine/circulation";
import { DEFAULT_ENGINE_INPUT, generateEngineOptions, generateEngineWithFit, validateEngineInput } from "@/lib/layout/engine/solver";
import type { EngineInput, ZoningInput } from "@/lib/layout/engine/types";
type Over = Omit<Partial<EngineInput>, "zoning"> & { zoning?: Partial<ZoningInput> };
import type { Room } from "@/lib/model/types";

const room = (type: Room["type"], name: string, x: number, y: number, width: number, depth: number): Room => ({ id: `${name}${x}${y}`, type, name, x, y, width, depth });
const inp = (o: Over): EngineInput => ({ ...DEFAULT_ENGINE_INPUT, ...o, zoning: { ...DEFAULT_ENGINE_INPUT.zoning, ...(o.zoning ?? {}) } });
const blank = (w: number, d: number, floors: number) => createProject({ name: "t", plotWidth: w, plotDepth: d, floors, buildingType: "custom", unitSystem: "metric", targetBudget: null } as never);

describe("engine: zoning envelope", () => {
  it("subtracts setbacks and caps the footprint by coverage and FAR", () => {
    const e = computeEnvelope({ width: 12, depth: 20 }, { setbackFront: 3, setbackRear: 2, setbackSide: 1.5, maxCoveragePct: 50, maxFar: 1.5 }, 2, "bottom");
    expect(e.errors).toEqual([]);
    expect(e.width).toBeCloseTo(9, 6);
    expect(e.depth).toBeCloseTo(15, 6);
    expect(e.envelopeArea).toBeCloseTo(135, 6);
    expect(e.plotArea).toBe(240);
    // coverage 50% of 240 = 120; FAR 1.5 x 240 / 2 floors = 180; envelope 135 -> 120 wins
    expect(e.maxFootprint).toBeCloseTo(120, 6);
    expect(e.maxBuiltUp).toBeCloseTo(360, 6);
    expect(e.x).toBe(1.5);
    expect(e.y).toBe(2); // rear setback sits at the top when the front is at the bottom
  });
  it("FAR can be the binding limit and depends on the number of floors", () => {
    const z = { setbackFront: 0, setbackRear: 0, setbackSide: 0, maxCoveragePct: null, maxFar: 1.0 };
    expect(computeEnvelope({ width: 10, depth: 20 }, z, 2).maxFootprint).toBeCloseTo(100, 6);
    expect(computeEnvelope({ width: 10, depth: 20 }, z, 4).maxFootprint).toBeCloseTo(50, 6);
    expect(maxFloorsByFar(200, 1.0, 50)).toBe(4);
    expect(maxFloorsByFar(200, null, 50)).toBeNull();
  });
  it("swaps front and rear when the front side is the top", () => {
    const e = computeEnvelope({ width: 12, depth: 20 }, { setbackFront: 3, setbackRear: 2, setbackSide: 1, maxCoveragePct: null, maxFar: null }, 1, "top");
    expect(e.y).toBe(3);
  });
  it("rejects impossible and nonsense limits with plain messages", () => {
    expect(computeEnvelope({ width: 6, depth: 8 }, { setbackFront: 5, setbackRear: 5, setbackSide: 0, maxCoveragePct: null, maxFar: null }, 1).errors[0]).toMatch(/no buildable area/);
    expect(computeEnvelope({ width: 12, depth: 20 }, { setbackFront: -1, setbackRear: 0, setbackSide: 0, maxCoveragePct: null, maxFar: null }, 1).errors.length).toBe(1);
    expect(computeEnvelope({ width: 12, depth: 20 }, { setbackFront: 0, setbackRear: 0, setbackSide: 0, maxCoveragePct: 150, maxFar: null }, 1).errors[0]).toMatch(/between 0 and 100/);
    expect(computeEnvelope({ width: 12, depth: 20 }, { setbackFront: 0, setbackRear: 0, setbackSide: 0, maxCoveragePct: 2, maxFar: null }, 1).errors[0]).toMatch(/too small/);
  });
  it("checkZoning reports each breach", () => {
    const z = { setbackFront: 3, setbackRear: 2, setbackSide: 1.5, maxCoveragePct: 40, maxFar: 0.8 };
    const plot = { width: 12, depth: 20 };
    const fp = { x: 1.5, y: 2, width: 9, depth: 15 };
    const one = checkZoning(plot, z, fp, 100, "bottom");
    expect(one.length).toBe(1);
    expect(one[0]).toMatch(/Ground coverage 56\.3 % exceeds 40 %/); // 135 / 240; FAR 0.42 is fine
    expect(checkZoning(plot, z, fp, 250, "bottom").length).toBe(2); // FAR 1.04 > 0.8 as well
    expect(checkZoning(plot, z, { x: 0.5, y: 1.5, width: 5, depth: 17 }, 50, "bottom").length).toBe(3); // front, rear and side breached
  });
});

describe("engine: structural grid", () => {
  it("validates spans, snaps and finds column points", () => {
    expect(validateGrid({ spanX: 3, spanY: 3 })).toEqual([]);
    expect(validateGrid({ spanX: 1.5, spanY: 3 })[0]).toMatch(/too small/);
    expect(validateGrid({ spanX: 3, spanY: 9 })[0]).toMatch(/special structural design/);
    expect(snapToSpan(7.4, 3)).toBe(6);
    expect(snapToSpan(0.2, 3)).toBe(3);
    expect(floorToSpan(8.9, 3)).toBe(6);
    const { xs, ys } = columnLines(9, 3, [0, 3, 4.2, 7.2]);
    expect(xs).toEqual([0, 3, 6, 9]);
    expect(columnPoints(xs, ys).length).toBe(16);
  });
  it("measures alignment", () => {
    const rooms = [room("bedroom", "a", 0, 0, 3, 3), room("bedroom", "b", 3, 0, 3.4, 3)];
    const a = gridAlignment(rooms, [0, 3, 6], [0, 3]);
    expect(a.total).toBe(8);
    expect(a.onGrid).toBe(7); // only the 6.4 edge is off the grid
  });
});

describe("engine: wet walls", () => {
  it("measures shared wet walls and vertical stacking", () => {
    const g = [room("bathroom", "b1", 0, 0, 2, 3), room("kitchen", "k", 2, 0, 3, 3), room("bedroom", "x", 5, 0, 3, 3)];
    const up = [room("bathroom", "b2", 0, 0, 2, 3), room("bathroom", "b3", 6, 0, 2, 3)];
    const r = analyseWetWalls([g, up]);
    expect(r.wetRooms).toBe(4);
    expect(r.sharedWallM).toBeCloseTo(3, 6);
    expect(r.groupedRatio).toBeCloseTo(0.5, 6); // b1 and k touch; b2 and b3 do not
    expect(r.stackedRatio).toBeCloseTo(0.5, 6); // b2 above b1, b3 above nothing wet
    expect(r.unstacked).toEqual(["b3 (floor 2)"]);
  });
  it("is 100% stacked when there is nothing above", () => {
    expect(analyseWetWalls([[room("bathroom", "b", 0, 0, 2, 3)]]).stackedRatio).toBe(1);
  });
});

describe("engine: circulation and code-style rules", () => {
  const fp = { x: 0, y: 0, width: 6, depth: 4.2 };
  it("flags a corridor narrower than 1.0 m and accepts 1.2 m", () => {
    const bad = checkCirculation([[room("bedroom", "a", 0, 0, 6, 3), room("corridor", "c", 0, 3, 6, 0.9), room("bedroom", "b", 0, 3.9, 6, 0.3)]], [], { x: 0, y: 0, width: 6, depth: 4.2 });
    expect(bad.issues.some((i) => i.code === "corridor_narrow")).toBe(true);
    const ok = checkCirculation([[room("bedroom", "a", 0, 0, 6, 3), room("corridor", "c", 0, 3, 6, 1.2)]], [], fp);
    expect(ok.issues.some((i) => i.code === "corridor_narrow")).toBe(false);
    expect(ok.circulationRatio).toBeCloseTo(7.2 / 25.2, 6);
  });
  it("flags long thin rooms and rooms below the minimum short side", () => {
    const r = checkCirculation([[room("bedroom", "thin", 0, 0, 6, 2), room("bedroom", "ok", 0, 2, 6, 3)]], [], { x: 0, y: 0, width: 6, depth: 5 });
    const codes = r.issues.map((i) => i.code);
    expect(codes.includes("room_narrow")).toBe(true);
    expect(codes.includes("room_ratio")).toBe(true);
  });
  it("reports dead space and overlaps", () => {
    const dead = checkCirculation([[room("bedroom", "a", 0, 0, 3, 3)]], [], { x: 0, y: 0, width: 6, depth: 3 });
    expect(dead.voidArea).toBeCloseTo(9, 6);
    expect(dead.issues.some((i) => i.code === "dead_space")).toBe(true);
    const ov = checkCirculation([[room("bedroom", "a", 0, 0, 3, 3), room("bedroom", "b", 2, 0, 3, 3)]], [], { x: 0, y: 0, width: 5, depth: 3 });
    expect(ov.issues.some((i) => i.code === "overlap")).toBe(true);
  });
  it("detects two doors that swing into each other", () => {
    const rooms = [room("bedroom", "R", 0, 0, 3, 3), room("corridor", "C", 0, 3, 3, 1.2)];
    const d = (x: number) => ({ floorIndex: 0, kind: "door" as const, x, y: 3, width: 0.9, height: 2.1, sill: 0, purpose: "d" });
    const clash = checkCirculation([rooms], [d(1.0), d(1.6)], { x: 0, y: 0, width: 3, depth: 4.2 });
    expect(clash.issues.some((i) => i.code === "door_swing_clash")).toBe(true);
    const fine = checkCirculation([rooms], [d(0.6), d(2.4)], { x: 0, y: 0, width: 3, depth: 4.2 });
    expect(fine.issues.some((i) => i.code === "door_swing_clash")).toBe(false);
  });
});

const scenarios: Array<[string, number, number, Over]> = [
  ["12x15 one floor 2 bed, 3.0 grid", 12, 15, { floors: 1, bedrooms: 2 }],
  ["12x15 two floors 3 bed, 3.0 grid", 12, 15, { floors: 2, bedrooms: 3 }],
  ["15x20 two floors 3 bed, 3.6 grid", 15, 20, { floors: 2, bedrooms: 3, grid: { spanX: 3.6, spanY: 3.6 } }],
  ["12x15 setbacks, coverage and FAR", 12, 15, { floors: 2, bedrooms: 3, zoning: { setbackFront: 3, setbackRear: 2, setbackSide: 1.5, maxCoveragePct: 50, maxFar: 1.2 } }],
  ["front at top", 12, 15, { floors: 2, bedrooms: 2, frontSide: "top", zoning: { setbackFront: 2, setbackRear: 1, setbackSide: 1 } }],
  ["large grid 4.5 x 6.0", 20, 25, { floors: 2, bedrooms: 4, includeGarage: true, grid: { spanX: 4.5, spanY: 6 } }],
  ["three floors 4 bed", 12, 18, { floors: 3, bedrooms: 4 }],
];

describe("engine: generated layouts", () => {
  for (const [name, w, d, over] of scenarios) {
    it(`${name}: inside limits, on the grid, valid, reachable`, () => {
      const input = inp(over);
      const res = generateEngineOptions({ width: w, depth: d }, input);
      expect(res.errors).toEqual([]);
      expect(res.options.length).toBeGreaterThan(0);
      const plotArea = w * d;
      const z = input.zoning;
      for (const o of res.options) {
        // 1. strictly inside the legal envelope
        const f = o.footprint;
        const front = input.frontSide === "bottom" ? d - (f.y + f.depth) : f.y;
        const rear = input.frontSide === "bottom" ? f.y : d - (f.y + f.depth);
        expect(front).toBeGreaterThanOrEqual(z.setbackFront - 1e-6);
        expect(rear).toBeGreaterThanOrEqual(z.setbackRear - 1e-6);
        expect(f.x).toBeGreaterThanOrEqual(z.setbackSide - 1e-6);
        expect(w - (f.x + f.width)).toBeGreaterThanOrEqual(z.setbackSide - 1e-6);
        if (z.maxCoveragePct != null) expect((f.width * f.depth) / plotArea * 100).toBeLessThanOrEqual(z.maxCoveragePct + 1e-6);
        if (z.maxFar != null) expect(o.builtUpArea / plotArea).toBeLessThanOrEqual(z.maxFar + 1e-6);
        expect(checkZoning({ width: w, depth: d }, z, f, o.builtUpArea, input.frontSide)).toEqual([]);
        // 2. rooms tile the footprint exactly (no dead space, no overlap) and stay inside it
        for (const fl of o.floors) {
          const area = fl.rooms.reduce((s, r) => s + r.width * r.depth, 0);
          expect(area).toBeCloseTo(f.width * f.depth, 2);
          for (const r of fl.rooms) {
            expect(r.x).toBeGreaterThanOrEqual(f.x - 1e-6);
            expect(r.y).toBeGreaterThanOrEqual(f.y - 1e-6);
            expect(r.x + r.width).toBeLessThanOrEqual(f.x + f.width + 1e-6);
            expect(r.y + r.depth).toBeLessThanOrEqual(f.y + f.depth + 1e-6);
          }
        }
        // 3. footprint width is a whole number of structural bays
        expect(Math.abs(f.width / input.grid.spanX - Math.round(f.width / input.grid.spanX))).toBeLessThan(1e-6);
        // 4. stairs and wet rooms line up between floors
        if (input.floors > 1) {
          const stairs = o.floors.map((fl) => fl.rooms.find((r) => r.type === "staircase"));
          for (const s of stairs) expect(s).toBeTruthy();
          for (const s of stairs) { expect(s!.x).toBeCloseTo(stairs[0]!.x, 6); expect(s!.y).toBeCloseTo(stairs[0]!.y, 6); }
          const wet = analyseWetWalls(o.floors.map((fl) => fl.rooms));
          expect(wet.stackedRatio).toBeGreaterThanOrEqual(0.6);
        }
        // 5. corridor at least 1.0 m wide
        for (const fl of o.floors) for (const r of fl.rooms) if (r.name === "Corridor") expect(Math.min(r.width, r.depth)).toBeGreaterThanOrEqual(1.0 - 1e-6);
        // 6. applies cleanly and passes the SAME validator as hand-drawn designs
        const { project, failed } = applyOption(blank(w, d, input.floors), o);
        expect(failed).toEqual([]);
        const issues = validateProject(project);
        expect(countBySeverity(issues).error).toBe(0);
        expect(issues.filter((i) => i.code === "room-no-door")).toEqual([]);
      }
    });
  }

  it("returns at most 3 ranked options, best first, with unique labels", () => {
    const res = generateEngineOptions({ width: 12, depth: 15 }, inp({ floors: 2, bedrooms: 3 }));
    expect(res.options.length).toBeLessThanOrEqual(3);
    const scores = res.options.map((o) => o.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(new Set(res.options.map((o) => o.label)).size).toBe(res.options.length);
  });
  it("is deterministic", () => {
    const strip = (r: ReturnType<typeof generateEngineOptions>) => JSON.stringify(r.options.map((o) => ({ ...o, floors: o.floors.map((f) => f.rooms.map((q) => [q.type, q.x, q.y, q.width, q.depth])) })));
    const a = generateEngineOptions({ width: 12, depth: 15 }, inp({ floors: 2, bedrooms: 3 }));
    const b = generateEngineOptions({ width: 12, depth: 15 }, inp({ floors: 2, bedrooms: 3 }));
    expect(strip(a)).toBe(strip(b));
  });
  it("respects a corridor width input", () => {
    const res = generateEngineOptions({ width: 12, depth: 15 }, inp({ floors: 2, bedrooms: 3, corridorWidth: 1.0 }));
    const c = res.options[0].floors[0].rooms.find((r) => r.name === "Corridor")!;
    expect(Math.min(c.width, c.depth)).toBeCloseTo(1.0, 6);
  });
  it("explains instead of forcing a bad layout when the limits leave no room", () => {
    const tight = generateEngineOptions({ width: 12, depth: 15 }, inp({ floors: 2, bedrooms: 3, zoning: { maxCoveragePct: 8 } }));
    expect(tight.options).toEqual([]);
    expect(tight.errors[0]).toMatch(/too small|No layout fits/);
    const farTight = generateEngineOptions({ width: 12, depth: 15 }, inp({ floors: 3, bedrooms: 4, zoning: { maxFar: 0.5 } }));
    expect(farTight.options).toEqual([]);
    const setbacks = generateEngineOptions({ width: 12, depth: 15 }, inp({ zoning: { setbackFront: 8, setbackRear: 8 } }));
    expect(setbacks.errors[0]).toMatch(/no buildable area/);
  });
  it("validates inputs", () => {
    expect(validateEngineInput(inp({ floors: 0 }))[0]).toMatch(/Floors/);
    expect(validateEngineInput(inp({ bedrooms: 9 }))[0]).toMatch(/Bedrooms/);
    expect(validateEngineInput(inp({ corridorWidth: 0.6 }))[0]).toMatch(/Corridor width/);
    expect(validateEngineInput(inp({ grid: { spanX: 1, spanY: 3 } }))[0]).toMatch(/too small/);
    expect(validateEngineInput(inp({}))).toEqual([]);
  });
  it("places the building inside the largest rectangle of a shaped plot", () => {
    const poly = [{ x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 9 }, { x: 9, y: 9 }, { x: 9, y: 18 }, { x: 0, y: 18 }];
    const res = generateEngineWithFit({ width: 18, depth: 18, polygon: poly }, inp({ floors: 2, bedrooms: 3 }));
    expect(res.errors).toEqual([]);
    for (const o of res.options) expect(o.notes.some((n) => /largest rectangle/.test(n))).toBe(true);
  });
  it("does not touch the classic generator's output", async () => {
    const { generateOptions, DEFAULT_AUTODESIGN_INPUT } = await import("@/lib/layout/autodesign");
    const a = generateOptions({ width: 9, depth: 12 }, { ...DEFAULT_AUTODESIGN_INPUT, floors: 2, bedrooms: 3 });
    expect(a.options.length).toBeGreaterThan(0);
    expect(a.options[0].label).toBe("Option A");
  });
});
