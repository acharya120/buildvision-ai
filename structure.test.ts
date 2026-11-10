import { describe, expect, it } from "vitest";
import { buildStructure, letterLabel } from "@/lib/structure/structure";
import { detailSvg } from "@/lib/structure/detailSvg";
import { DEFAULT_DETAIL } from "@/lib/model/defaults";
import { SAMPLES } from "@/lib/model/samples";
import { parseProjectJson, serializeProject } from "@/lib/model/schema";
import { setDetail } from "@/lib/model/ops";
import { planToSvg } from "@/lib/export/svg";
import { validateProject } from "@/lib/validation/validate";
import type { Floor, Wall } from "@/lib/model/types";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({ id, x1, y1, x2, y2, thickness: 0.23, auto: true });
const floorOf = (walls: Wall[]): Floor => ({ id: "f", name: "F", height: 3, rooms: [], walls, openings: [], dimensions: [] });

describe("structural layout", () => {
  it("puts a column at each corner of a plain rectangle and a beam on each side", () => {
    const s = buildStructure(floorOf([wall("a", 0, 0, 4, 0), wall("b", 4, 0, 4, 3), wall("c", 4, 3, 0, 3), wall("d", 0, 3, 0, 0)]), 4.5);
    expect(s.columns).toHaveLength(4);
    expect(s.beams).toHaveLength(4);
    expect(s.gridX.map((g) => g.label)).toEqual(["1", "2"]);
    expect(s.gridY.map((g) => g.label)).toEqual(["A", "B"]);
  });
  it("adds a column where an inner wall meets the outside wall (T junction)", () => {
    const s = buildStructure(floorOf([wall("a", 0, 0, 8, 0), wall("b", 8, 0, 8, 3), wall("c", 8, 3, 0, 3), wall("d", 0, 3, 0, 0), wall("e", 4, 0, 4, 3)]), 8);
    expect(s.columns).toHaveLength(6);
  });
  it("adds extra columns on long runs and none on short ones", () => {
    const long = floorOf([wall("a", 0, 0, 12, 0), wall("b", 12, 0, 12, 3), wall("c", 12, 3, 0, 3), wall("d", 0, 3, 0, 0)]);
    const s = buildStructure(long, 4.5);
    expect(s.columns.length).toBeGreaterThan(4);
    const xs = s.columns.map((c) => c.x).sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i++) expect(xs[i + 1] - xs[i]).toBeLessThanOrEqual(4.5 + 1e-6);
    expect(buildStructure(long, 20).columns).toHaveLength(4);
  });
  it("leaves out inner columns that would crowd another column but keeps all outside ones", () => {
    const thin = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({ id, x1, y1, x2, y2, thickness: 0.115, auto: true });
    const outer = [wall("a", 0, 0, 10, 0), wall("b", 10, 0, 10, 6), wall("c", 10, 6, 0, 6), wall("d", 0, 6, 0, 0)];
    const many = buildStructure(floorOf([...outer, thin("e", 5, 0, 5, 6), thin("f", 5.8, 0, 5.8, 6)]), 20);
    expect(many.columns.filter((c) => c.x > 4 && c.x < 7).length).toBeLessThanOrEqual(4);
    expect(many.columns.some((c) => c.x === 0 && c.y === 0)).toBe(true);
    expect(many.columns.some((c) => c.x === 10 && c.y === 6)).toBe(true);
    expect(many.gridX.length).toBeLessThanOrEqual(4);
  });
  it("copes with no walls and with diagonal walls", () => {
    expect(buildStructure(floorOf([]), 4.5).columns).toEqual([]);
    expect(buildStructure(floorOf([wall("a", 0, 0, 3, 4)]), 4.5).columns).toEqual([]);
  });
  it("letters grid lines A..Z, AA, AB", () => {
    expect(letterLabel(0)).toBe("A");
    expect(letterLabel(25)).toBe("Z");
    expect(letterLabel(26)).toBe("AA");
    expect(letterLabel(27)).toBe("AB");
  });
  it("works on every sample and keeps columns inside the plot", () => {
    for (const smp of SAMPLES) {
      const p = smp.build();
      for (const f of p.floors) {
        const s = buildStructure(f, 4.5);
        expect(s.columns.length).toBeLessThanOrEqual(800);
        for (const c of s.columns) {
          expect(c.x).toBeGreaterThanOrEqual(-0.01);
          expect(c.y).toBeGreaterThanOrEqual(-0.01);
          expect(c.x).toBeLessThanOrEqual(p.plot.width + 0.01);
          expect(c.y).toBeLessThanOrEqual(p.plot.depth + 0.01);
        }
      }
    }
  });
});

describe("detail layers in drawings", () => {
  const base = SAMPLES.find((s) => s.key === "villa-3bhk")!.build();
  const withDetail = setDetail(base, DEFAULT_DETAIL);
  it("draw nothing when the details are off", () => {
    const f = base.floors[0];
    expect(detailSvg(base, f, 0, (m) => m * 10, (m) => m * 10, 10, 1, 0, 0)).toBe("");
  });
  it("add columns, beams, footings, grid labels and stair text when on", () => {
    const f = withDetail.floors[0];
    const svg = detailSvg(withDetail, f, 0, (m) => m * 10, (m) => m * 10, 10, 1, -20, -20);
    expect(svg).toContain('fill="#b91c1c"');
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain(">A<");
    expect(svg).toContain(">1<");
    expect(svg).toMatch(/>(UP|DN|UP\/DN)</);
  });
  it("show up in the exported plan only when enabled, and keep the SVG well formed", () => {
    const off = planToSvg(base, base.floors[0].id, {});
    const on = planToSvg(withDetail, withDetail.floors[0].id, {});
    expect(on.length).toBeGreaterThan(off.length);
    expect(off).not.toContain("#b91c1c");
    expect(on).toContain("#b91c1c");
    expect(on.startsWith("<svg")).toBe(true);
    expect(on.trim().endsWith("</svg>")).toBe(true);
  });
  it("round-trip through save and import, and bad values fall back to defaults", () => {
    const back = parseProjectJson(serializeProject(withDetail));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.project.detail).toEqual(DEFAULT_DETAIL);
    const raw = JSON.parse(serializeProject(withDetail));
    raw.project.detail.columnSize = -5;
    raw.project.detail.maxSpan = "x";
    const again = parseProjectJson(JSON.stringify(raw));
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.project.detail?.columnSize).toBe(0.3);
      expect(again.project.detail?.maxSpan).toBe(4.5);
    }
  });
  it("do not change validation results", () => {
    expect(validateProject(withDetail).map((i) => i.code)).toEqual(validateProject(base).map((i) => i.code));
    expect(setDetail(withDetail, null).detail).toBeUndefined();
  });
});
