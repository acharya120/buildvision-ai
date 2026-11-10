import { describe, expect, it } from "vitest";
import { areaSummary, unionArea } from "@/lib/structure/areas";
import { computeLoads, CONCRETE_WEIGHT } from "@/lib/structure/loads";
import { DEFAULT_DETAIL, DEFAULT_LOADS } from "@/lib/model/defaults";
import { SAMPLES } from "@/lib/model/samples";
import { parseProjectJson, serializeProject } from "@/lib/model/schema";
import { setDetail } from "@/lib/model/ops";
import { detailSvg } from "@/lib/structure/detailSvg";
import { validateProject } from "@/lib/validation/validate";

const sample = () => SAMPLES.find((s) => s.build().floors.length >= 3)!.build();
const withLoads = (p = sample()) => setDetail(p, { ...DEFAULT_DETAIL, loads: DEFAULT_LOADS });

describe("areas and FAR", () => {
  it("unions overlapping rectangles once", () => {
    expect(unionArea([{ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 1, y0: 0, x1: 3, y1: 2 }])).toBeCloseTo(6);
    expect(unionArea([])).toBe(0);
  });
  it("FAR is total built-up / plot area, coverage uses the ground floor", () => {
    const p = sample();
    const a = areaSummary(p);
    expect(a.plotArea).toBeCloseTo(p.plot.width * p.plot.depth);
    expect(a.far).toBeCloseTo(a.totalBuiltUp / a.plotArea);
    expect(a.coveragePct).toBeCloseTo((a.floors[0].builtUp / a.plotArea) * 100);
    expect(a.floors).toHaveLength(p.floors.length);
    expect(a.totalBuiltUp).toBeGreaterThan(0);
  });
  it("does not change the project", () => {
    const p = sample();
    const before = JSON.stringify(p);
    areaSummary(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("load distribution", () => {
  it("is off unless asked for", () => {
    expect(computeLoads(sample())).toBeNull();
    expect(computeLoads(setDetail(sample(), DEFAULT_DETAIL))).toBeNull();
  });
  it("conserves load: everything reaches the ground", () => {
    const p = withLoads();
    const r = computeLoads(p)!;
    const floorSum = r.floors.reduce((a, f) => a + f.floorTotal, 0);
    expect(r.totalToGround).toBeCloseTo(floorSum, 3);
    expect(r.totalToGround).toBeGreaterThan(0);
  });
  it("lower columns carry at least as much as the same floor's own load", () => {
    const r = computeLoads(withLoads())!;
    for (const f of r.floors) for (const c of f.columns) expect(c.total).toBeGreaterThanOrEqual(c.own - 1e-9);
    const g = r.floors[0].columns;
    expect(Math.max(...g.map((c) => c.total))).toBeGreaterThan(Math.max(...g.map((c) => c.own)));
  });
  it("heavier live load gives a heavier result", () => {
    const p = withLoads();
    const p2 = setDetail(p, { ...p.detail!, loads: { ...DEFAULT_LOADS, liveLoad: 6 } });
    expect(computeLoads(p2)!.totalToGround).toBeGreaterThan(computeLoads(p)!.totalToGround);
  });
  it("footing check only reports and uses the entered footing size", () => {
    const p = withLoads();
    const small = setDetail(p, { ...p.detail!, footingSize: 0.4 });
    const r = computeLoads(small)!;
    expect(r.footings.some((f) => !f.ok)).toBe(true);
    for (const f of r.footings) expect(f.neededSide).toBeCloseTo(Math.sqrt(f.load / DEFAULT_LOADS.bearing), 6);
    expect(small.detail!.footingSize).toBe(0.4);
    expect(CONCRETE_WEIGHT).toBe(25);
  });
  it("grid references look like A-1", () => {
    for (const f of computeLoads(withLoads())!.footings) expect(f.ref).toMatch(/^[A-Z]+-\d+$/);
  });
  it("labels appear on the plan only when switched on, and validation is unchanged", () => {
    const p = withLoads();
    expect(detailSvg(p, p.floors[0], 0, (m) => m * 20, (m) => m * 20, 20, 1, 0, 0)).toContain(" kN<");
    const off = setDetail(p, { ...p.detail!, loads: { ...DEFAULT_LOADS, show: false } });
    expect(detailSvg(off, off.floors[0], 0, (m) => m * 20, (m) => m * 20, 20, 1, 0, 0)).not.toContain(" kN<");
    const base = sample();
    expect(validateProject(withLoads(base))).toEqual(validateProject(base));
  });
  it("round-trips through JSON and falls back on bad values", () => {
    const p = withLoads();
    const back = parseProjectJson(serializeProject(p));
    expect(back.ok && back.project.detail?.loads).toEqual(DEFAULT_LOADS);
    const raw = JSON.parse(serializeProject(p));
    raw.project.detail.loads.bearing = -5;
    raw.project.detail.loads.liveLoad = "x";
    const bad = parseProjectJson(JSON.stringify(raw));
    expect(bad.ok && bad.project.detail?.loads?.bearing).toBe(150);
    expect(bad.ok && bad.project.detail?.loads?.liveLoad).toBe(2);
  });
  it("works for every sample within a sane time", () => {
    for (const s of SAMPLES) {
      const p = withLoads(s.build());
      const r = computeLoads(p)!;
      expect(Number.isFinite(r.totalToGround)).toBe(true);
    }
  });
});
