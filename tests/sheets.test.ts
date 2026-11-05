import { describe, expect, it } from "vitest";
import { sheetSvg, markColumns, groupBeams, pickFloors, type SheetKind } from "@/lib/structure/sheets";
import { buildStructure } from "@/lib/structure/structure";
import { areaSummary } from "@/lib/structure/areas";
import { SAMPLES } from "@/lib/model/samples";
import { createProject, setDetail } from "@/lib/model/ops";
import { DEFAULT_DETAIL } from "@/lib/model/defaults";
import { parseProjectJson, serializeProject } from "@/lib/model/schema";
import { validateProject } from "@/lib/validation/validate";

const KINDS: SheetKind[] = ["columns", "beams", "footings", "section", "iso", "site"];
const wellFormed = (svg: string) => svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>") && !/&(?!amp;|lt;|gt;|quot;|#39;)/.test(svg) && !/NaN|undefined|Infinity/.test(svg);

describe("structural and site sheets", () => {
  it("every sample gives every sheet, valid and labelled indicative", () => {
    for (const s of SAMPLES) {
      const p = s.build();
      for (const k of KINDS) {
        const svg = sheetSvg(p, k);
        expect(wellFormed(svg)).toBe(true);
        expect(svg).toContain("NOT A STRUCTURAL DESIGN");
      }
    }
  });
  it("works with Details off and does not change the project or its checks", () => {
    const p = SAMPLES[1].build();
    const before = JSON.stringify(p);
    const v0 = validateProject(p);
    for (const k of KINDS) sheetSvg(p, k);
    expect(JSON.stringify(p)).toBe(before);
    expect(validateProject(p)).toEqual(v0);
    expect(p.detail).toBeUndefined();
  });
  it("column marks cover every column and the schedule total matches", () => {
    const p = SAMPLES[0].build();
    const st = buildStructure(p.floors[0], DEFAULT_DETAIL.maxSpan);
    const marked = markColumns(st);
    expect(marked).toHaveLength(st.columns.length);
    expect(marked.filter((c) => c.mark === "C1").length).toBeGreaterThanOrEqual(4); // a rectangle has four corners
    expect(sheetSvg(p, "columns")).toContain(`>${st.columns.length}<`);
  });
  it("beam groups add up to all beams", () => {
    const p = SAMPLES[2].build();
    const st = buildStructure(p.floors[0], DEFAULT_DETAIL.maxSpan);
    const { groups, markOf } = groupBeams(p, st);
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(st.beams.length);
    expect(groups.reduce((a, g) => a + g.total, 0)).toBeCloseTo(st.beams.reduce((a, b) => a + Math.hypot(b.x2 - b.x1, b.y2 - b.y1), 0), 3);
    for (const b of st.beams) expect(groups.some((g) => g.mark === markOf(b))).toBe(true);
  });
  it("uses the numbers the user entered", () => {
    const p = SAMPLES[0].build();
    const a = setDetail({ ...p, unitSystem: "metric" }, { ...DEFAULT_DETAIL, columnSize: 0.45, footingSize: 1.8, foundationDepth: 2.2, parapetHeight: 0.6 });
    expect(sheetSvg(a, "columns")).toContain("0.45 m x 0.45 m");
    expect(sheetSvg(a, "footings")).toContain("1.80 m x 1.80 m");
    const sec = sheetSvg(a, "section");
    expect(sec).toContain("Founding -2.20");
    expect(sec).toContain("Parapet 0.60 m high");
  });
  it("site sheet quotes the same FAR as the area summary", () => {
    for (const s of SAMPLES.slice(0, 4)) {
      const p = s.build();
      expect(sheetSvg(p, "site")).toContain(areaSummary(p).far.toFixed(2));
    }
  });
  it("a tall building skips floors instead of making a huge file", () => {
    const tall = SAMPLES.find((s) => s.build().floors.length >= 10)!.build();
    const svg = sheetSvg(tall, "iso");
    expect(svg.length).toBeLessThan(2_500_000);
    const pick = pickFloors(100, 8);
    expect(pick.idx).toHaveLength(7);
    expect(pick.idx[pick.idx.length - 1]).toBe(99);
    expect(pick.skipped).toEqual([6, 98]);
    expect(pickFloors(5, 8).skipped).toBeNull();
  });
  it("an empty project does not crash", () => {
    const p = createProject({ name: "Empty", plotWidth: 10, plotDepth: 8, unitSystem: "metric", buildingType: "single-floor", floors: 1 });
    for (const k of KINDS) expect(wellFormed(sheetSvg(p, k))).toBe(true);
  });
  it("new Details values survive saving and bad values fall back", () => {
    const p = setDetail(SAMPLES[0].build(), { ...DEFAULT_DETAIL, foundationDepth: 2, plinthHeight: 0.6, footingThickness: 0.5, parapetHeight: 0.9 });
    const back = parseProjectJson(serializeProject(p));
    expect(back.ok && back.project.detail?.foundationDepth).toBe(2);
    expect(back.ok && back.project.detail?.parapetHeight).toBe(0.9);
    const raw = JSON.parse(serializeProject(p));
    raw.project.detail.foundationDepth = -3;
    raw.project.detail.plinthHeight = "x";
    const bad = parseProjectJson(JSON.stringify(raw));
    expect(bad.ok && bad.project.detail?.foundationDepth).toBe(1.5);
    expect(bad.ok && bad.project.detail?.plinthHeight).toBe(0.45);
  });
});
