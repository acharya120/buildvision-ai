import { describe, expect, it } from "vitest";
import { addRoom, addOpeningOnWall, createProject, deleteRoom, generateWalls, setRate } from "@/lib/model/ops";
import { mk, applyOption, DEFAULT_AUTODESIGN_INPUT } from "@/lib/layout/autodesign";
import { generateHouseWithFit } from "@/lib/layout/autodesignFit";
import { DEFAULT_CARBON, DEFAULT_CARBON_FACTORS, computeCarbon } from "@/lib/engineering/carbon";
import { DEFAULT_ENERGY, computeEnergy } from "@/lib/engineering/energy";
import { EMPTY_ACCESS, EXAMPLE_ACCESS, checkAccessibility } from "@/lib/engineering/accessibility";
import { EMPTY_FIRE, EXAMPLE_FIRE, fireAnalysis } from "@/lib/engineering/fire";
import { detectClashes, subtractIv, wallLines, diffLines } from "@/lib/engineering/clash";
import { renovationDiff, renovationCost } from "@/lib/engineering/renovation";
import { issueRevision, revLetter, changesSinceLast, summariseChanges, revisionsCsv } from "@/lib/engineering/revisions";
import { buildReport, reportHtml, reportCsv } from "@/lib/engineering/report";
import { PRELIM } from "@/lib/engineering/prelim";
import { loadSnapshots } from "@/lib/history/history";
import { buildTakeoff } from "@/lib/materials/takeoff";
import type { Project } from "@/lib/model/types";

const removeRoom = (p: Project, fid: string, rid: string) => generateWalls(deleteRoom(p, fid, rid), fid);
const gen = (p: Project) => p.floors.reduce((q, f) => generateWalls(q, f.id), p);
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } };

function house(w = 12, d = 15, floors = 2, bedrooms = 3): Project {
  const r = generateHouseWithFit({ width: w, depth: d }, { ...DEFAULT_AUTODESIGN_INPUT, floors, bedrooms });
  return applyOption(createProject({ name: "H", plotWidth: w, plotDepth: d, unitSystem: "metric", buildingType: "duplex", floors: 1 }), r.options[0]).project;
}

describe("carbon", () => {
  it("multiplies quantities by factors, never double counts concrete, and what-ifs reduce only the targeted items", () => {
    const p = house();
    const c = computeCarbon(p, DEFAULT_CARBON);
    expect(c.embodiedKg).toBeGreaterThan(1000);
    expect(c.lines.some((l) => l.key === "mat-concrete")).toBe(false);
    expect(c.lines.reduce((s, l) => s + l.sharePct, 0)).toBeCloseTo(100, 6);
    const bricks = buildTakeoff(p).lines.find((l) => l.key === "mat-bricks")!.quantity;
    expect(c.lines.find((l) => l.key === "mat-bricks")!.kg).toBeCloseTo(bricks * DEFAULT_CARBON_FACTORS["mat-bricks"].kg, 3);
    const cut = computeCarbon(p, { ...DEFAULT_CARBON, cementCutPct: 50 });
    expect(cut.embodiedKg).toBeLessThan(c.embodiedKg);
    expect(cut.whatIfSavingKg).toBeCloseTo(c.embodiedKg - cut.embodiedKg, 4);
    expect(cut.lines.find((l) => l.key === "mat-bricks")!.kg).toBeCloseTo(c.lines.find((l) => l.key === "mat-bricks")!.kg, 6);
    const custom = computeCarbon(p, { ...DEFAULT_CARBON, factors: { "mat-steel": 0 } });
    expect(custom.lines.find((l) => l.key === "mat-steel")!.kg).toBe(0);
    const op = computeCarbon(p, { ...DEFAULT_CARBON, annualKwh: 1000, gridKgPerKwh: 0.5, years: 10 });
    expect(op.operationalKg).toBe(5000);
    expect(op.lifetimeKg).toBeCloseTo(c.embodiedKg + 5000, 4);
  });
  it("empty plan gives zero", () => expect(computeCarbon(createProject({ name: "E", plotWidth: 10, plotDepth: 10, unitSystem: "metric", buildingType: "single-floor", floors: 1 }), DEFAULT_CARBON).embodiedKg).toBe(0));
});

describe("energy", () => {
  it("improved envelope lowers the load; hotter outside raises it; more glass raises solar gain", () => {
    const p = house();
    const e = computeEnergy(p, DEFAULT_ENERGY);
    expect(e.peakKw).toBeGreaterThan(0);
    expect(e.improvedPeakKw).toBeLessThan(e.peakKw);
    expect(e.savingPct).toBeGreaterThan(10);
    expect(computeEnergy(p, { ...DEFAULT_ENERGY, tOut: 45 }).peakKw).toBeGreaterThan(e.peakKw);
    expect(computeEnergy(p, { ...DEFAULT_ENERGY, current: { ...DEFAULT_ENERGY.current, shgc: 0.9 } }).peakSolarW).toBeGreaterThan(e.peakSolarW);
    expect(computeEnergy(p, { ...DEFAULT_ENERGY, tOut: 20, tIn: 26 }).conductionW).toBe(computeEnergy(p, { ...DEFAULT_ENERGY, tOut: 20, tIn: 26 }).roofArea * DEFAULT_ENERGY.current.uRoof * 15);
    expect(e.wwrPct).toBeGreaterThan(0);
    expect(e.wwrPct).toBeLessThan(60);
    expect(e.pvKwp).toBeCloseTo((e.roofArea * 0.4) / 6, 6);
    expect(e.tonnage).toBeCloseTo((e.peakKw * 1.1) / 3.517, 6);
  });
});

describe("accessibility", () => {
  it("passes and fails against door widths, and reports not set when empty", () => {
    const p = house();
    const empty = checkAccessibility(p, EMPTY_ACCESS);
    expect(empty.filter((c) => c.status === "fail").length).toBeLessThanOrEqual(2);
    const strict = checkAccessibility(p, { ...EXAMPLE_ACCESS, minDoorWidth: 5, minEntranceWidth: 5 });
    expect(strict.filter((c) => c.group === "Doors" && c.status === "fail").length).toBeGreaterThan(0);
    const lenient = checkAccessibility(p, { ...EXAMPLE_ACCESS, minDoorWidth: 0.1, minEntranceWidth: 0.1 });
    expect(lenient.filter((c) => c.group === "Doors").every((c) => c.status === "pass")).toBe(true);
    expect(checkAccessibility(p, EXAMPLE_ACCESS).some((c) => c.label.startsWith("Ramp"))).toBe(true);
    expect(checkAccessibility(p, EXAMPLE_ACCESS).some((c) => c.group === "Lift")).toBe(true); // 2 floors, no lift
  });
});

describe("fire safety routes", () => {
  it("finds the shortest escape route and compares it with the limit you enter", () => {
    let p = createProject({ name: "F", plotWidth: 20, plotDepth: 10, unitSystem: "metric", buildingType: "single-floor", floors: 1 });
    const f = p.floors[0].id;
    p = addRoom(p, f, mk("living", "A", 0, 0, 6, 6));
    p = addRoom(p, f, mk("bedroom", "B", 6, 0, 6, 6));
    p = addRoom(p, f, mk("bedroom", "C", 12, 0, 6, 6));
    p = gen(p);
    // doors: outside door on A, door A-B, door B-C
    const wallAt = (x1: number, y1: number, x2: number, y2: number) => p.floors[0].walls.find((w) => Math.abs(w.x1 - x1) < 0.01 && Math.abs(w.y1 - y1) < 0.01 && Math.abs(w.x2 - x2) < 0.01 && Math.abs(w.y2 - y2) < 0.01) ?? p.floors[0].walls.find((w) => Math.abs(w.x1 - x2) < 0.01 && Math.abs(w.y1 - y2) < 0.01 && Math.abs(w.x2 - x1) < 0.01 && Math.abs(w.y2 - y1) < 0.01);
    void wallAt;
    const walls = p.floors[0].walls;
    const vert = (x: number) => walls.find((w) => Math.abs(w.x1 - x) < 0.01 && Math.abs(w.x2 - x) < 0.01 && Math.abs(Math.max(w.y1, w.y2) - Math.min(w.y1, w.y2)) > 5);
    const horiz = (y: number) => walls.find((w) => Math.abs(w.y1 - y) < 0.01 && Math.abs(w.y2 - y) < 0.01 && Math.abs(w.x2 - w.x1) > 5 && Math.min(w.x1, w.x2) < 1);
    const add = (wid: string, off: number) => { const r = addOpeningOnWall(p, f, wid, "door", off, { width: 0.9, height: 2.1, sill: 0 }); if ("error" in r) throw new Error(r.error); p = r.project; };
    const lw = vert(0)!;
    add(lw.id, 2.5);
    const ab = vert(6)!; add(ab.id, 2.5);
    const bc = vert(12)!; add(bc.id, 2.5);
    const fa = fireAnalysis(p, EXAMPLE_FIRE);
    const rooms = fa.floors[0].rooms;
    const A = rooms.find((r) => r.name === "A")!, B = rooms.find((r) => r.name === "B")!, C = rooms.find((r) => r.name === "C")!;
    expect(A.distance!).toBeCloseTo(3, 1);
    expect(B.distance!).toBeGreaterThan(A.distance!);
    expect(C.distance!).toBeGreaterThan(B.distance!);
    expect(C.distance!).toBeGreaterThan(12); // through two doors
    expect(fa.floors[0].exits.length).toBe(1);
    const tight = fireAnalysis(p, { ...EMPTY_FIRE, maxTravel: 10 });
    expect(tight.checks.some((c) => c.status === "fail" && c.label.startsWith("C"))).toBe(true);
    const loose = fireAnalysis(p, { ...EMPTY_FIRE, maxTravel: 100 });
    expect(loose.checks.filter((c) => c.group === "Travel distance").every((c) => c.status === "pass")).toBe(true);
    // a room with no door route is reported
    const q = gen(addRoom(p, f, mk("store", "D", 0, 6, 4, 3)));
    const unreachable = fireAnalysis(q, EMPTY_FIRE).checks.find((c) => c.label.startsWith("D "));
    expect(unreachable?.status).toBe("fail");
  });
  it("multi-floor houses give every floor a route set without crashing", () => {
    const fa = fireAnalysis(house(), EXAMPLE_FIRE);
    expect(fa.floors.length).toBe(2);
    expect(fa.floors[0].extinguishers).toBeGreaterThan(0);
  });
});

describe("clash detection", () => {
  it("interval maths", () => {
    expect(subtractIv([[0, 10]], [[2, 3], [5, 6]])).toEqual([[0, 2], [3, 5], [6, 10]]);
    expect(subtractIv([[0, 10]], [[-1, 11]])).toEqual([]);
    expect(subtractIv([[0, 10]], [])).toEqual([[0, 10]]);
  });
  it("finds overlapping openings and unsupported upper walls, and leaves the plan alone", () => {
    let p = createProject({ name: "K", plotWidth: 12, plotDepth: 12, unitSystem: "metric", buildingType: "duplex", floors: 2 });
    const [g, u] = p.floors;
    p = addRoom(p, g.id, mk("living", "L", 0, 0, 6, 6));
    p = addRoom(p, u.id, mk("bedroom", "Up", 3, 0, 6, 6)); // sticks out beyond the room below
    p = gen(p);
    const snap = JSON.stringify(p);
    const cl = detectClashes(p);
    expect(JSON.stringify(p)).toBe(snap);
    expect(cl.some((c) => c.between === "Wall × support")).toBe(true);
    expect(cl.some((c) => c.between === "Room × support")).toBe(true);
    const top = p.floors[0].walls.find((w) => Math.abs(w.y1) < 0.01 && Math.abs(w.y2) < 0.01)!;
    const a = addOpeningOnWall(p, g.id, top.id, "window", 1, { width: 1.2, height: 1.2, sill: 0.9 });
    if ("error" in a) throw new Error(a.error);
    // force an overlapping second opening directly in the data, as a bad import could
    const bad = { ...a.project, floors: a.project.floors.map((f, i) => (i === 0 ? { ...f, openings: [...f.openings, { ...f.openings[0], id: "dup", offset: f.openings[0].offset + 0.3 }] } : f)) };
    expect(detectClashes(bad).some((c) => c.between === "Opening × opening" && c.severity === "high")).toBe(true);
  });
  it("runs on generated houses of many sizes", () => {
    for (const [w, d, f, b] of [[9, 12, 1, 2], [12, 15, 2, 3], [15, 20, 3, 4]] as const) {
      const p = house(w, d, f, b);
      const cl = detectClashes(p);
      expect(cl.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
    }
  });
});

describe("renovation", () => {
  it("measures removed and added walls and rooms between existing and proposed", () => {
    const base = house(12, 15, 1, 2);
    expect(renovationDiff(base, base)).toMatchObject({ rooms: [], removedWallM: 0, addedWallM: 0, demolishedM3: 0, newM3: 0 });
    const victim = base.floors[0].rooms.find((r) => r.type === "bedroom")!;
    const cur = removeRoom(base, base.floors[0].id, victim.id);
    const d = renovationDiff(base, cur);
    expect(d.rooms.some((r) => r.kind === "demolished" && r.roomId === victim.id)).toBe(true);
    expect(d.removedWallM).toBeGreaterThan(0);
    expect(d.demolishedM3).toBeCloseTo(d.removedWalls.reduce((s, w) => s + w.length * base.floors[0].height * w.thickness, 0), 3);
    const back = renovationDiff(cur, base);
    expect(back.addedWallM).toBeCloseTo(d.removedWallM, 3);
    expect(back.rooms.some((r) => r.kind === "new")).toBe(true);
    const cost0 = renovationCost(d, {});
    expect(cost0.total).toBe(0);
    expect(cost0.unrated).toBeGreaterThan(0);
    const cost = renovationCost(d, { "ren-demolish": 1000, "ren-debris": 500 });
    expect(cost.total).toBeCloseTo(d.demolishedM3 * 1000 + d.demolishedM3 * 1.3 * 500, 1);
    void setRate;
  });
  it("detects a moved room", () => {
    const base = house(12, 15, 1, 2);
    const r = base.floors[0].rooms[0];
    const cur = { ...base, floors: [{ ...base.floors[0], rooms: base.floors[0].rooms.map((q) => (q.id === r.id ? { ...q, width: q.width + 0.5 } : q)) }] };
    expect(renovationDiff(base, cur).rooms.some((c) => c.kind === "modified" && c.roomId === r.id)).toBe(true);
  });
});

describe("revision register", () => {
  it("names revisions, records what changed and keeps a restorable snapshot", () => {
    expect([0, 1, 25, 26, 27].map(revLetter)).toEqual(["A", "B", "Z", "AA", "AB"]);
    const p = house(12, 15, 1, 2);
    mem.clear();
    const a = issueRevision(p, [], "N. Acharya", "First issue for approval");
    expect(a.revision.rev).toBe("A");
    expect(a.revision.changes).toEqual(["First issue."]);
    expect(a.stored).toBe(true);
    expect(loadSnapshots(p.id).length).toBe(1);
    const victim = p.floors[0].rooms.find((r) => r.type === "bedroom")!;
    const p2 = removeRoom(p, p.floors[0].id, victim.id);
    const b = issueRevision(p2, [a.revision], "N. Acharya", "Bedroom removed");
    expect(b.revision.rev).toBe("B");
    expect(b.revision.changes.some((c) => c.includes("removed"))).toBe(true);
    expect(changesSinceLast(p2, b.revision)[0]).toContain("No change");
    expect(summariseChanges(renovationDiff(p, p2)).length).toBeGreaterThan(0);
    const csv = revisionsCsv(p, [a.revision, b.revision]);
    expect(csv).toContain(PRELIM);
    expect(csv.split("\n").length).toBeGreaterThanOrEqual(5);
  });
});

describe("report and analytics", () => {
  it("collects every module, escapes HTML and carries the preliminary notice", () => {
    const p = { ...house(), name: "<b>x</b> & Co" };
    const r = buildReport(p);
    expect(r.sections.length).toBeGreaterThanOrEqual(5);
    expect(r.charts.areaByType.reduce((s, b) => s + b.value, 0)).toBeGreaterThan(50);
    const html = reportHtml(r);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain(PRELIM);
    expect(reportCsv(r)).toContain(PRELIM);
    const withRates = buildReport(setRate(p, "mat-bricks", 10));
    expect(withRates.charts.costByGroup.length).toBeGreaterThan(0);
  });
});
void wallLines; void diffLines;
