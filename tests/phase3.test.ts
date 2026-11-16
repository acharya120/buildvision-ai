import { describe, expect, it } from "vitest";
import { applyOption } from "@/lib/layout/autodesign";
import { createProject, setDetail } from "@/lib/model/ops";
import { DEFAULT_DETAIL } from "@/lib/model/defaults";
import { DEFAULT_ENGINE_INPUT, generateEngineOptions } from "@/lib/layout/engine/solver";
import { liveSummary } from "@/lib/analysis/live";
import { planToSvg } from "@/lib/export/svg";
import { buildDxf } from "@/lib/export/dxf";
import type { Project } from "@/lib/model/types";

const blank = (w: number, d: number, floors: number) => createProject({ name: "t", plotWidth: w, plotDepth: d, floors, buildingType: "custom", unitSystem: "metric", targetBudget: null } as never);
function sample(withDetail: boolean): Project {
  const res = generateEngineOptions({ width: 12, depth: 15 }, { ...DEFAULT_ENGINE_INPUT, floors: 2, bedrooms: 3 });
  const p = applyOption(blank(12, 15, 2), res.options[0]).project;
  return withDetail ? setDetail(p, DEFAULT_DETAIL) : p;
}
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("phase3: live summary", () => {
  it("is zero-safe for an empty project", () => {
    const s = liveSummary(blank(10, 10, 1));
    expect(s.roomArea).toBe(0);
    expect(s.circulationPct).toBe(0);
    expect(s.byType).toEqual([]);
    expect(s.totalCost).toBeNull();
    expect(Number.isNaN(s.far)).toBe(false);
  });
  it("adds up: by-type areas equal room area, floors equal room area, coverage and FAR are finite", () => {
    const s = liveSummary(sample(false));
    expect(s.byType.reduce((a, t) => a + t.area, 0)).toBeCloseTo(s.roomArea, 6);
    expect(s.floors.reduce((a, f) => a + f.roomArea, 0)).toBeCloseTo(s.roomArea, 6);
    expect(s.builtUp).toBeGreaterThan(s.roomArea * 0.99);
    expect(s.far).toBeCloseTo(s.builtUp / s.plotArea, 6);
    expect(s.circulationPct).toBeGreaterThan(0);
    expect(s.circulationPct).toBeLessThan(60);
    expect(s.boq.map((l) => l.key)).toContain("flooring");
  });
  it("shows a cost only for lines where the user entered a rate", () => {
    const p = sample(false);
    expect(liveSummary(p).totalCost).toBeNull();
    const q = { ...p, rates: { ...p.rates, flooring: 100 } };
    const s = liveSummary(q);
    expect(s.totalCost).toBeCloseTo(s.boq.find((l) => l.key === "flooring")!.quantity * 100, 1);
    expect(s.unratedCount).toBeGreaterThan(0);
  });
});

describe("phase3: layered SVG", () => {
  it("leaves the classic drawing unchanged when no layer options are given", () => {
    const p = sample(true);
    const a = planToSvg(p, p.floors[0].id);
    expect(a).not.toContain("data-layer");
    const norm = (x: string) => x.replace(/view\d+/g, "view");
    expect(norm(a)).toBe(norm(planToSvg(p, p.floors[0].id, {})));
  });
  it("wraps content in balanced named groups", () => {
    const p = sample(true);
    const s = planToSvg(p, p.floors[0].id, { layered: true });
    for (const id of ["GRID", "PLOT", "ROOMS", "WALLS", "OPENINGS", "FURNITURE", "DIMENSIONS", "ANNOTATION"]) expect(s).toContain(`id="${id}"`);
    expect(count(s, /<g[ >]/g)).toBe(count(s, /<\/g>/g));
  });
  it("hides dimensions, furniture and grid when switched off, and shows them when on", () => {
    const p = sample(true);
    const fid = p.floors[0].id;
    const all = planToSvg(p, fid, { layered: true, layers: { grid: true, dimensions: true, furniture: true } });
    const none = planToSvg(p, fid, { layered: true, layers: { grid: false, dimensions: false, furniture: false } });
    expect(all).toContain("Plot width");
    expect(none).not.toContain("Plot width");
    expect(none).not.toContain("Plot depth");
    expect(count(none, /<rect/g)).toBeLessThan(count(all, /<rect/g));
    expect(count(none, /<line/g)).toBeLessThan(count(all, /<line/g));
    expect(count(none, /<g[ >]/g)).toBe(count(none, /<\/g>/g));
  });
  it("can show furniture on a project that has no detail settings", () => {
    const p = sample(false);
    const on = planToSvg(p, p.floors[0].id, { layered: true, layers: { furniture: true, grid: false, dimensions: true } });
    const off = planToSvg(p, p.floors[0].id, { layered: true, layers: { furniture: false, grid: false, dimensions: true } });
    expect(count(on, /<rect/g)).toBeGreaterThan(count(off, /<rect/g));
  });
});

describe("phase3: layered DXF", () => {
  const pairs = (d: string) => { const l = d.split(/\r?\n/); const o: Array<[string, string]> = []; for (let i = 0; i + 1 < l.length; i += 2) o.push([l[i], l[i + 1]]); return o; };
  const layersDeclared = (d: string) => { const ps = pairs(d); const out = new Set<string>(); ps.forEach(([c, v], i) => { if (c === "0" && v === "LAYER" && ps[i + 1]?.[0] === "2") out.add(ps[i + 1][1]); }); return out; };
  const layersUsed = (d: string) => new Set(pairs(d).filter(([c]) => c === "8").map(([, v]) => v));
  it("is unchanged by default", () => {
    const p = sample(false);
    const d = buildDxf(p);
    expect(d).toBe(buildDxf(p, {}));
    expect(layersUsed(d).has("GRID")).toBe(false);
    expect(d).not.toContain("PRELIMINARY");
  });
  it("adds only the ticked layers, each declared, with a preliminary note", () => {
    const p = sample(false);
    const d = buildDxf(p, { layers: { grid: true, dimensions: true, furniture: true } });
    for (const n of ["GRID", "DIMENSIONS", "FURNITURE"]) { expect(layersUsed(d).has(n)).toBe(true); expect(layersDeclared(d).has(n)).toBe(true); }
    for (const n of layersUsed(d)) expect(layersDeclared(d).has(n)).toBe(true);
    expect(d).toContain("PRELIMINARY");
    const d2 = buildDxf(p, { layers: { grid: false, dimensions: false, furniture: true } });
    expect(layersUsed(d2).has("GRID")).toBe(false);
    expect(layersUsed(d2).has("DIMENSIONS")).toBe(false);
    expect(layersUsed(d2).has("FURNITURE")).toBe(true);
    expect(d2.includes("NaN")).toBe(false);
  });
});
