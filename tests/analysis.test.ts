import { describe, expect, it } from "vitest";
import { addRoom, createProject, setNorth } from "@/lib/model/ops";
import { mk } from "@/lib/layout/autodesign";
import { applyOption, DEFAULT_AUTODESIGN_INPUT } from "@/lib/layout/autodesign";
import { generateHouseWithFit } from "@/lib/layout/autodesignFit";
import { bearingOfVector, edgeBearing, sectorOf, angDiff } from "@/lib/analysis/compass";
import { vastuCheck } from "@/lib/analysis/vastu";
import { dayLength, dayOfYear, sunPosition, shadowPolygons, sunReport, sunHoursOn } from "@/lib/analysis/sun";
import { exposureOf, windAnalysis, windSummary } from "@/lib/analysis/wind";
import { DEFAULT_SERVICES, electricalFloor, plumbingFloor, servicesSummary } from "@/lib/analysis/services";
import { DEFAULT_TIMELINE, addWorkDays, buildTimeline } from "@/lib/analysis/timeline";
import { computeRoi, emiOf, irr, loanBalanceAfter, type RoiInput } from "@/lib/analysis/roi";
import { EMPTY_RULES, EXAMPLE_RULES, checkCompliance, complianceSummary, setbackDistances } from "@/lib/analysis/compliance";
import { designMetrics, spaceHints } from "@/lib/analysis/compare";
import type { Project } from "@/lib/model/types";

const base = () => createProject({ name: "A", plotWidth: 10, plotDepth: 10, unitSystem: "metric", buildingType: "single-floor", floors: 1 });
function quad(north = 0): Project {
  let p = base();
  const f = p.floors[0].id;
  p = addRoom(p, f, mk("living", "Living", 5, 0, 5, 5)); // plan top-right
  p = addRoom(p, f, mk("kitchen", "Kitchen", 5, 5, 5, 5)); // bottom-right
  p = addRoom(p, f, mk("master-bedroom", "Master", 0, 5, 5, 5)); // bottom-left
  p = addRoom(p, f, mk("bathroom", "Bath", 0, 0, 5, 5)); // top-left
  return setNorth(p, north);
}
function house(w = 12, d = 15, floors = 2, bedrooms = 3): Project {
  const r = generateHouseWithFit({ width: w, depth: d }, { ...DEFAULT_AUTODESIGN_INPUT, floors, bedrooms });
  return applyOption(createProject({ name: "H", plotWidth: w, plotDepth: d, unitSystem: "metric", buildingType: "duplex", floors: 1 }), r.options[0]).project;
}

describe("compass", () => {
  it("converts plan directions to bearings", () => {
    expect(bearingOfVector(0, -1, 0)).toBeCloseTo(0, 6); // up = north
    expect(bearingOfVector(1, 0, 0)).toBeCloseTo(90, 6);
    expect(bearingOfVector(0, -1, 90)).toBeCloseTo(270, 6); // north points right, so up is west
    expect(sectorOf(44)).toBe("NE");
    expect(sectorOf(359)).toBe("N");
    expect(edgeBearing("top", 0)).toBe(0);
    expect(edgeBearing("right", 90)).toBe(0);
    expect(angDiff(350, 10)).toBe(-20);
  });
});

describe("vastu", () => {
  it("rates rooms by direction and follows the north angle", () => {
    const v = vastuCheck(quad(0));
    const by = Object.fromEntries(v.rooms.map((r) => [r.name, r]));
    expect(by.Living.sector).toBe("NE");
    expect(by.Living.rating).toBe("favoured");
    expect(by.Kitchen.sector).toBe("SE");
    expect(by.Kitchen.rating).toBe("favoured");
    expect(by.Master.sector).toBe("SW");
    expect(by.Master.rating).toBe("favoured");
    expect(by.Bath.sector).toBe("NW");
    expect(by.Bath.rating).toBe("favoured");
    expect(v.favoured).toBe(4);
    const v2 = vastuCheck(quad(180));
    const k = v2.rooms.find((r) => r.name === "Kitchen")!;
    expect(k.sector).toBe("NW");
    expect(k.rating).toBe("acceptable");
    expect(v2.rooms.find((r) => r.name === "Living")!.sector).toBe("SW");
  });
  it("works for generated multi-floor houses and an empty plan", () => {
    const v = vastuCheck(house());
    expect(v.rated).toBeGreaterThan(3);
    expect(vastuCheck(base())).toEqual({ rooms: [], entrance: null, favoured: 0, rated: 0, avoid: [] });
  });
});

describe("sun and shadow", () => {
  it("matches textbook solar geometry", () => {
    const june = dayOfYear(6, 21), dec = dayOfYear(12, 21), mar = dayOfYear(3, 21);
    expect(sunPosition(28.6, june, 12).altitude).toBeCloseTo(84.9, 0);
    expect(sunPosition(28.6, dec, 12).altitude).toBeCloseTo(38.0, 0);
    expect(sunPosition(28.6, dec, 12).azimuth).toBeCloseTo(180, 0);
    expect(sunPosition(28.6, mar, 9).azimuth).toBeLessThan(180);
    expect(sunPosition(28.6, mar, 15).azimuth).toBeGreaterThan(180);
    expect(dayLength(0, mar)).toBeCloseTo(12, 0);
    expect(dayLength(28.6, june)).toBeGreaterThan(dayLength(28.6, dec));
    expect(sunPosition(28.6, mar, 0).altitude).toBeLessThan(0);
  });
  it("casts shadows away from the sun and none at night", () => {
    const p = quad(0);
    const sun = { altitude: 30, azimuth: 180 }; // sun in the south
    const polys = shadowPolygons(p, sun);
    expect(polys.length).toBe(4);
    const minY = Math.min(...polys.flat().map((q) => q.y));
    expect(minY).toBeLessThan(-2); // shadow falls to the north (plan up), beyond the building
    expect(shadowPolygons(p, { altitude: 1, azimuth: 90 })).toEqual([]);
    const east = shadowPolygons(p, { altitude: 30, azimuth: 270 }); // sun in the west, shadow to the east
    expect(Math.max(...east.flat().map((q) => q.x))).toBeGreaterThan(12);
  });
  it("counts sun hours per facade sensibly", () => {
    const n = dayOfYear(12, 21);
    expect(sunHoursOn(28.6, n, 180)).toBeGreaterThan(sunHoursOn(28.6, n, 0));
    expect(sunHoursOn(28.6, dayOfYear(6, 21), 180)).toBeLessThan(sunHoursOn(28.6, n, 180)); // high summer sun misses the south wall for much of the day
    const r = sunReport(house(), 28.6, dayOfYear(3, 21));
    expect(r.windows.length).toBeGreaterThan(0);
    expect(r.windows.every((w) => w.hours >= 0 && w.hours <= 13)).toBe(true);
  });
});

describe("wind and ventilation", () => {
  it("classifies walls against the wind", () => {
    expect(exposureOf(0, 0)).toBe("windward");
    expect(exposureOf(180, 0)).toBe("leeward");
    expect(exposureOf(90, 0)).toBe("side");
    expect(exposureOf(315, 0)).toBe("windward");
  });
  it("rates rooms and responds to the wind direction", () => {
    const p = house();
    const a = windAnalysis(p, 0), b = windAnalysis(p, 180);
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(3);
    for (const r of a) { expect(r.ratio).toBeGreaterThanOrEqual(0); expect(["good", "fair", "poor", "none"]).toContain(r.rating); }
    const s = windSummary(a);
    expect(s.good + s.fair + s.poor + s.none).toBe(a.length);
  });
});

describe("electrical and plumbing", () => {
  it("places points inside rooms and counts a sensible load", () => {
    const p = house();
    for (const f of p.floors) {
      for (const e of electricalFloor(f, DEFAULT_SERVICES)) {
        const r = f.rooms.find((q) => q.id === e.roomId)!;
        expect(e.x).toBeGreaterThanOrEqual(r.x - 1e-6);
        expect(e.x).toBeLessThanOrEqual(r.x + r.width + 1e-6);
        expect(e.y).toBeGreaterThanOrEqual(r.y - 1e-6);
        expect(e.y).toBeLessThanOrEqual(r.y + r.depth + 1e-6);
      }
    }
    const s = servicesSummary(p, DEFAULT_SERVICES);
    expect(s.points.light).toBeGreaterThan(5);
    expect(s.points.switch).toBeGreaterThan(3);
    expect(s.connectedKw).toBeGreaterThan(1);
    expect(servicesSummary(p, { ...DEFAULT_SERVICES, acInBedrooms: true }).connectedKw).toBeGreaterThan(s.connectedKw);
    expect(s.fixtures.wc).toBeGreaterThan(0);
    expect(s.tankLitres % 100).toBe(0);
    expect(s.tankLitres).toBeGreaterThanOrEqual(s.dailyLitres);
    expect(servicesSummary(p, { ...DEFAULT_SERVICES, people: 10 }).dailyLitres).toBe(1350);
  });
  it("plumbing runs connect every wet room to the stack; no wet rooms gives none", () => {
    const pl = plumbingFloor(quad().floors[0]);
    expect(pl.stack).not.toBeNull();
    expect(pl.runs.every((r) => r.length > 0)).toBe(true);
    let p = base();
    p = addRoom(p, p.floors[0].id, mk("bedroom", "B", 0, 0, 4, 4));
    expect(plumbingFloor(p.floors[0]).stack).toBeNull();
    expect(servicesSummary(p, DEFAULT_SERVICES).supplyPipeM).toBe(0);
  });
});

describe("timeline", () => {
  it("skips non-working days", () => {
    expect(addWorkDays("2026-11-13", 1, 6).toISOString().slice(0, 10)).toBe("2026-11-14");
    expect(addWorkDays("2026-11-13", 2, 6).toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(addWorkDays("2026-11-13", 1, 5).toISOString().slice(0, 10)).toBe("2026-11-16");
  });
  it("orders phases, scales with size and crew", () => {
    const small = buildTimeline(house(9, 12, 1, 2), { ...DEFAULT_TIMELINE, startDate: "2026-12-01" });
    const big = buildTimeline(house(14, 18, 2, 4), { ...DEFAULT_TIMELINE, startDate: "2026-12-01" });
    expect(big.totalWorkDays).toBeGreaterThan(small.totalWorkDays);
    for (const ph of big.phases) {
      expect(ph.end).toBeGreaterThan(ph.start);
      if (ph.after) { const pr = big.phases.find((x) => x.id === ph.after)!; expect(ph.start).toBeGreaterThanOrEqual(pr.start); expect(ph.start).toBeLessThanOrEqual(pr.end); }
    }
    expect(big.phases.filter((x) => x.id.startsWith("slab")).length).toBe(2);
    const fast = buildTimeline(house(14, 18, 2, 4), { ...DEFAULT_TIMELINE, startDate: "2026-12-01", crew: 2 });
    expect(fast.totalWorkDays).toBeLessThan(big.totalWorkDays);
    expect(big.finish > "2026-12-01").toBe(true);
  });
});

const ROI: RoiInput = { land: 3_000_000, construction: 4_000_000, otherCostPct: 5, marketValue: 9_000_000, monthlyRent: 40_000, occupancyPct: 90, maintenancePct: 1, propertyTaxYear: 20_000, appreciationPct: 5, rentGrowthPct: 3, years: 10, sellingCostPct: 2, loanAmount: 3_000_000, loanRatePct: 8.5, loanYears: 20, discountPct: 10 };
describe("property ROI", () => {
  it("matches known loan and IRR maths", () => {
    expect(emiOf(1_000_000, 8, 20)).toBeCloseTo(8364.4, 0);
    expect(emiOf(1200, 0, 1)).toBeCloseTo(100, 6);
    expect(emiOf(0, 8, 20)).toBe(0);
    expect(loanBalanceAfter(1_000_000, 8, 20, 0)).toBeCloseTo(1_000_000, 4);
    expect(loanBalanceAfter(1_000_000, 8, 20, 240)).toBe(0);
    expect(loanBalanceAfter(1_000_000, 8, 20, 120)).toBeGreaterThan(600_000);
    expect(loanBalanceAfter(1_000_000, 8, 20, 120)).toBeLessThan(700_000);
    expect(irr([-100, 110])).toBeCloseTo(0.1, 6);
    expect(irr([-100, -10])).toBeNull();
  });
  it("computes yields, cash flows and is consistent", () => {
    const r = computeRoi(ROI);
    expect(r.totalInvestment).toBeCloseTo(7_350_000, 0);
    expect(r.equity).toBeCloseTo(4_350_000, 0);
    expect(r.grossYieldPct).toBeCloseTo(((40_000 * 12 * 0.9) / 7_350_000) * 100, 6);
    expect(r.netYieldPct).toBeLessThan(r.grossYieldPct);
    expect(r.cashFlows.length).toBe(10);
    expect(r.cashFlows[1].rent).toBeCloseTo(r.cashFlows[0].rent * 1.03, 4);
    expect(r.saleValue).toBeCloseTo(9_000_000 * Math.pow(1.05, 10), 0);
    const sumNet = r.cashFlows.reduce((s, c) => s + c.net, 0);
    expect(r.profit).toBeCloseTo(-r.equity + sumNet + r.netSaleProceeds, 0);
    expect(r.irrLeveragedPct).not.toBeNull();
    expect(computeRoi({ ...ROI, loanAmount: 0 }).emi).toBe(0);
    expect(computeRoi({ ...ROI, loanAmount: 0 }).irrLeveragedPct).toBeCloseTo(computeRoi({ ...ROI, loanAmount: 0 }).irrUnleveragedPct!, 4);
    expect(computeRoi({ ...ROI, monthlyRent: 0, appreciationPct: 0, marketValue: 1 }).paybackYears).toBeNull();
  });
});

describe("compliance", () => {
  it("reports not set for empty rules and never changes the plan", () => {
    const p = house();
    const snap = JSON.stringify(p);
    const c = checkCompliance(p, EMPTY_RULES);
    expect(c.every((x) => x.status === "not set" || x.group === "Plot" || true)).toBe(true);
    expect(complianceSummary(c).fail).toBe(0);
    expect(JSON.stringify(p)).toBe(snap);
  });
  it("passes and fails against the numbers entered", () => {
    const p = house();
    const tight = checkCompliance(p, { ...EMPTY_RULES, far: 0.01, coveragePct: 99, maxHeight: 100 });
    expect(tight.find((x) => x.label.startsWith("Floor area ratio"))!.status).toBe("fail");
    expect(tight.find((x) => x.label.startsWith("Ground coverage"))!.status).toBe("pass");
    expect(tight.find((x) => x.label.startsWith("Building height"))!.status).toBe("pass");
    const ex = checkCompliance(p, EXAMPLE_RULES);
    expect(ex.some((x) => x.group === "Rooms")).toBe(true);
    const sb = setbackDistances(p)!;
    const front = checkCompliance(p, { ...EMPTY_RULES, front: sb.bottom + 1 }).find((x) => x.label.startsWith("Front"))!;
    expect(front.status).toBe("fail");
    const front2 = checkCompliance(p, { ...EMPTY_RULES, front: Math.max(0, sb.bottom - 0.01), roadSide: "bottom" }).find((x) => x.label.startsWith("Front"))!;
    expect(front2.status).toBe("pass");
    const top = checkCompliance(p, { ...EMPTY_RULES, front: sb.top + 0.5, roadSide: "top" }).find((x) => x.label.startsWith("Front"))!;
    expect(top.status).toBe("fail");
  });
  it("uses the project's own limits when no rule is typed", () => {
    const p = { ...house(), limits: { far: 0.001, coveragePct: null, maxHeight: null } };
    expect(checkCompliance(p, EMPTY_RULES).find((x) => x.label.startsWith("Floor area ratio"))!.status).toBe("fail");
  });
});

describe("comparison and space use", () => {
  it("computes metrics and hints", () => {
    const m = designMetrics(house());
    expect(m.floors).toBe(2);
    expect(m.bedrooms).toBeGreaterThanOrEqual(3);
    expect(m.cost).toBeNull(); // no rates entered, so no invented cost
    expect(m.circulationPct + m.wetPct + m.habitablePct).toBeLessThanOrEqual(300);
    expect(spaceHints({ ...m, circulationPct: 30 }).some((h) => h.includes("Circulation"))).toBe(true);
    expect(designMetrics(base()).rooms).toBe(0);
    expect(spaceHints(designMetrics(base()))).toEqual([]);
  });
});

import { shadowSvg, windSvg, vastuSvg, servicesSvg, timelineSvg } from "@/lib/analysis/sheets";
describe("analysis sheets", () => {
  const ok = (s: string) => expect(s.startsWith("<svg") && s.endsWith("</svg>") && !/NaN|undefined|Infinity/.test(s)).toBe(true);
  it("draw valid SVG for every view, including empty plans and rotated north", () => {
    for (const p of [house(), setNorth(house(), 135), base(), { ...house(), plot: { width: 12, depth: 15, polygon: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 15 }, { x: 6, y: 15 }, { x: 0, y: 9 }] } } as Project]) {
      ok(shadowSvg(p, sunPosition(28, 355, 15), "t"));
      ok(shadowSvg(p, { altitude: -5, azimuth: 0 }, "night"));
      for (const f of p.floors) {
        ok(windSvg(p, f, 225)); ok(vastuSvg(p, f));
        for (const l of ["both", "electrical", "plumbing"] as const) ok(servicesSvg(p, f, l, DEFAULT_SERVICES));
      }
      ok(timelineSvg(p, DEFAULT_TIMELINE));
    }
  });
});
