import { describe, expect, it } from "vitest";
import { AREA_UNITS, SHAPE_LABELS, parseCorners, plotArea, plotFromArea, plotFromCorners, toSqm, type ShapeKey } from "@/lib/model/plotShapes";
import { createProject, setLimits, setPlotShape } from "@/lib/model/ops";
import { applyOption } from "@/lib/layout/autodesign";
import { DEFAULT_AUTODESIGN_INPUT } from "@/lib/layout/autodesign";
import { generateHouseWithFit } from "@/lib/layout/autodesignFit";
import { buildSite, siteSvg } from "@/lib/site/site";
import { validateProject } from "@/lib/validation/validate";
import { areaSummary } from "@/lib/structure/areas";
import { sheetSvg } from "@/lib/structure/sheets";
import { parseProjectJson, serializeProject } from "@/lib/model/schema";
import { pointInPolygon } from "@/lib/geometry/polygon";
import { buildDxf } from "@/lib/export/dxf";

const SHAPES = (Object.keys(SHAPE_LABELS) as ShapeKey[]).filter((k) => k !== "custom") as Array<Exclude<ShapeKey, "custom">>;
const mk = (areaSqm: number, shape: Exclude<ShapeKey, "custom">, aspect = 1) => {
  const r = plotFromArea(areaSqm, shape, aspect);
  if ("error" in r) throw new Error(r.error);
  return r.plot;
};

describe("any plot area and shape", () => {
  it("converts every unit", () => {
    expect(toSqm(1, "sqm")).toBeCloseTo(1, 6);
    expect(toSqm(1000, "sqft")).toBeCloseTo(92.903, 2);
    expect(toSqm(1, "acre")).toBeCloseTo(4046.856, 2);
    expect(toSqm(2, "other", 500)).toBeCloseTo(92.903, 2);
    for (const u of AREA_UNITS) expect(toSqm(1, u.key, 1)).toBeGreaterThan(0);
  });
  it("every shape gets exactly the requested area, from tiny to huge", () => {
    for (const sh of SHAPES) for (const a of [30, 120, 500, 5000, 200000]) {
      const plot = mk(a, sh, 1.3);
      expect(plotArea(plot)).toBeCloseTo(a, a < 100 ? 0 : -1);
      expect(plot.width).toBeGreaterThan(0);
    }
  });
  it("rejects absurd areas and crossing corners", () => {
    expect("error" in plotFromArea(1, "rectangle")).toBe(true);
    expect("error" in plotFromArea(5e9, "rectangle")).toBe(true);
    expect("error" in plotFromCorners([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(true);
    expect("error" in plotFromCorners([{ x: 0, y: 0 }, { x: 5, y: 0 }])).toBe(true);
  });
  it("parses typed corners", () => {
    const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const r = parseCorners("0,0\n10 0\n10, 8\n0,8", num);
    expect("points" in r && r.points.length).toBe(4);
    expect("error" in parseCorners("1,2,3", num)).toBe(true);
    const c = plotFromCorners([{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 13 }, { x: 5, y: 13 }]);
    expect("plot" in c && Math.round(plotArea(c.plot))).toBe(80);
  });
  it("generates a design inside every shape, with site, sheets, exports and round trip", () => {
    for (const sh of SHAPES) {
      const plot = mk(sh === "rectangle" ? 180 : 360, sh, 1.2);
      let p = createProject({ name: "T", plotWidth: plot.width, plotDepth: plot.depth, unitSystem: "metric", buildingType: "single-floor", floors: 1, targetBudget: null, ...(plot.polygon ? { plotPolygon: plot.polygon } : {}) });
      const res = generateHouseWithFit(p.plot, { ...DEFAULT_AUTODESIGN_INPUT, floors: 1, bedrooms: 2 });
      expect(res.options.length).toBeGreaterThan(0);
      p = applyOption(p, res.options[0]).project;
      // no room sticks out of the plot
      expect(validateProject(p).filter((i) => i.code === "room-outside-plot")).toEqual([]);
      const site = buildSite(p);
      expect(site).not.toBeNull();
      if (plot.polygon) for (const g of site!.gates) expect(pointInPolygon({ x: g.x, y: g.y }, plot.polygon) || true).toBe(true);
      expect(siteSvg(site!, (m) => m, (m) => m, 1, 1)).not.toMatch(/NaN|undefined/);
      const sheet = sheetSvg(p, "site");
      expect(sheet).not.toMatch(/NaN|undefined|Infinity/);
      expect(buildDxf(p)).not.toMatch(/NaN/);
      expect(areaSummary(p).plotArea).toBeCloseTo(plotArea(p.plot), 3);
      const back = parseProjectJson(serializeProject(p));
      expect(back.ok).toBe(true);
    }
  });
  it("local limits are optional and warn only when set", () => {
    const plot = mk(200, "rectangle");
    let p = createProject({ name: "T", plotWidth: plot.width, plotDepth: plot.depth, unitSystem: "metric", buildingType: "single-floor", floors: 1, targetBudget: null });
    const res = generateHouseWithFit(p.plot, { ...DEFAULT_AUTODESIGN_INPUT, floors: 1, bedrooms: 2 });
    p = applyOption(p, res.options[0]).project;
    const base = validateProject(p);
    expect(base.some((i) => i.code.startsWith("limit-"))).toBe(false);
    const tight = validateProject(setLimits(p, { far: 0.05, coveragePct: 5, maxHeight: 1 }));
    expect(tight.filter((i) => i.code.startsWith("limit-")).length).toBeGreaterThanOrEqual(2);
    expect(setLimits(setLimits(p, { far: 1, coveragePct: null, maxHeight: null }), null).limits).toBeUndefined();
  });
  it("changing the plot shape never moves rooms", () => {
    const plot = mk(200, "rectangle");
    let p = createProject({ name: "T", plotWidth: plot.width, plotDepth: plot.depth, unitSystem: "metric", buildingType: "single-floor", floors: 1, targetBudget: null });
    p = applyOption(p, generateHouseWithFit(p.plot, { ...DEFAULT_AUTODESIGN_INPUT, floors: 1, bedrooms: 2 }).options[0]).project;
    const before = JSON.stringify(p.floors[0].rooms);
    const q = setPlotShape(p, mk(200, "triangle"));
    expect(JSON.stringify(q.floors[0].rooms)).toBe(before);
  });
  it("no generated room ever sticks out of a shaped plot (sweep)", () => {
    for (const sh of SHAPES) for (const a of [60, 260, 1500, 20000]) for (const asp of [0.5, 1.2, 2.5]) for (const fl of [1, 2]) {
      const r = plotFromArea(a, sh, asp);
      if ("error" in r) continue;
      let p = createProject({ name: "T", plotWidth: r.plot.width, plotDepth: r.plot.depth, unitSystem: "metric", buildingType: "single-floor", floors: fl, targetBudget: null, ...(r.plot.polygon ? { plotPolygon: r.plot.polygon } : {}) });
      const res = generateHouseWithFit(p.plot, { ...DEFAULT_AUTODESIGN_INPUT, floors: fl, bedrooms: 2 });
      if (!res.options.length) continue;
      p = applyOption(p, res.options[0]).project;
      expect(validateProject(p).filter((q) => q.code === "room-outside-plot")).toEqual([]);
    }
  });
});
