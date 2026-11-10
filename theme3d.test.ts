import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_PRESETS, isHexColor, sanitizeTheme } from "@/lib/geometry/theme3d";
import { footprintFill, hipRoofPositions, pillarPositions, roadAlong, shrubPositions } from "@/lib/geometry/landscape";

describe("3D colour themes", () => {
  it("every preset is made of valid #rrggbb colours", () => {
    for (const p of THEME_PRESETS) for (const v of Object.values(p.theme)) expect(isHexColor(v)).toBe(true);
  });
  it("sanitizeTheme keeps valid colours, replaces junk with defaults and never throws", () => {
    expect(sanitizeTheme(null)).toEqual(DEFAULT_THEME);
    expect(sanitizeTheme("x")).toEqual(DEFAULT_THEME);
    const t = sanitizeTheme({ wall: "#ABCDEF", roof: "red", sky: 5 });
    expect(t.wall).toBe("#abcdef");
    expect(t.roof).toBe(DEFAULT_THEME.roof);
    expect(t.sky).toBe(DEFAULT_THEME.sky);
  });
});

describe("hip roof", () => {
  for (const [w, d] of [[10, 6], [6, 10], [8, 8]]) {
    it(`stays inside its eaves and peaks above the wall top (${w} x ${d})`, () => {
      const { positions, rise } = hipRoofPositions({ x: 2, y: 3, width: w, depth: d }, 9, 0.4);
      expect(positions.length % 9).toBe(0);
      let maxY = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        expect(positions[i]).toBeGreaterThanOrEqual(2 - 0.4 - 1e-6);
        expect(positions[i]).toBeLessThanOrEqual(2 + w + 0.4 + 1e-6);
        expect(positions[i + 2]).toBeGreaterThanOrEqual(3 - 0.4 - 1e-6);
        expect(positions[i + 2]).toBeLessThanOrEqual(3 + d + 0.4 + 1e-6);
        maxY = Math.max(maxY, positions[i + 1]);
      }
      expect(maxY).toBeCloseTo(9 + rise, 6);
      expect(rise).toBeGreaterThanOrEqual(0.8);
      expect(rise).toBeLessThanOrEqual(3);
    });
  }
  it("measures how much of the bounding box the rooms fill", () => {
    const f = footprintFill([{ x: 0, y: 0, width: 4, depth: 4 }, { x: 4, y: 0, width: 4, depth: 4 }]);
    expect(f?.fill).toBeCloseTo(1, 6);
    const l = footprintFill([{ x: 0, y: 0, width: 4, depth: 4 }, { x: 4, y: 0, width: 4, depth: 2 }]);
    expect(l!.fill).toBeLessThan(0.85);
    expect(footprintFill([])).toBeNull();
  });
});

describe("landscape helpers", () => {
  const plot = { width: 20, depth: 30 };
  const wall = [
    { x: 0, y: 0, width: 20, depth: 0.23 },
    { x: 0, y: 29.77, width: 20, depth: 0.23 },
    { x: 0, y: 0.23, width: 0.23, depth: 29.54 },
  ];
  it("plants shrubs inside the plot, deterministically, within the cap", () => {
    const a = shrubPositions(wall, plot);
    expect(a.length).toBeGreaterThan(10);
    expect(a.length).toBeLessThanOrEqual(260);
    expect(shrubPositions(wall, plot)).toEqual(a);
    for (const s of a) {
      expect(s.x).toBeGreaterThan(-0.1);
      expect(s.x).toBeLessThan(plot.width + 0.1);
      expect(s.z).toBeGreaterThan(-0.1);
      expect(s.z).toBeLessThan(plot.depth + 0.1);
    }
    expect(shrubPositions(wall.map((r) => ({ ...r, width: r.width * 100 })), { width: 2000, depth: 30 }).length).toBeLessThanOrEqual(260);
  });
  it("places pillars without duplicates", () => {
    const p = pillarPositions(wall);
    expect(p.length).toBeGreaterThan(4);
    expect(new Set(p.map((q) => `${Math.round(q.x * 4)}:${Math.round(q.z * 4)}`)).size).toBe(p.length);
  });
  it("puts the road outside the plot on the chosen side", () => {
    const b = roadAlong("bottom", plot, 20);
    expect(b.road.cz - b.road.d / 2).toBeGreaterThanOrEqual(plot.depth);
    const t = roadAlong("top", plot, 20);
    expect(t.road.cz + t.road.d / 2).toBeLessThanOrEqual(0);
    const r = roadAlong("right", plot, 20);
    expect(r.road.cx - r.road.w / 2).toBeGreaterThanOrEqual(plot.width);
    expect(b.dashes.length).toBeGreaterThan(0);
    expect(b.dashes.length).toBeLessThanOrEqual(80);
  });
});
