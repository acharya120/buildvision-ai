import { describe, expect, it } from "vitest";
import { createProject } from "@/lib/model/ops";
import { applyOption, DEFAULT_AUTODESIGN_INPUT } from "@/lib/layout/autodesign";
import { generateHouseWithFit } from "@/lib/layout/autodesignFit";
import { applyWindowFix, reviewProject } from "@/lib/review/review";
import { planProjectInterior, furnitureCsv } from "@/lib/interior/plan";
import { ELEVATION_VIEWS, elevationSvg } from "@/lib/studio/elevationSheet";
import { interiorSvg } from "@/lib/studio/interiorSheet";
import { materialsSvg } from "@/lib/studio/materialsSheet";
import { buildTakeoff, takeoffCsv } from "@/lib/materials/takeoff";
import { materialsOf, sanitizeMaterials, setMaterials } from "@/lib/materials/config";
import { setRate } from "@/lib/model/ops";
import { parseProjectJson, serializeProject } from "@/lib/model/schema";
import { parseReview, describeProject } from "@/lib/ai/review";
import { addSnapshot, compareProjects, loadSnapshots, snapshotProject, MAX_SNAPSHOTS } from "@/lib/history/history";
import { validateProject } from "@/lib/validation/validate";
import type { Project } from "@/lib/model/types";

function house(w: number, d: number, floors: number, bedrooms: number): Project {
  const base = createProject({ name: "T", unitSystem: "metric", buildingType: "duplex", plotWidth: w, plotDepth: d, floors: 1, targetBudget: null });
  const r = generateHouseWithFit({ width: w, depth: d }, { ...DEFAULT_AUTODESIGN_INPUT, floors, bedrooms });
  if (!r.options.length) throw new Error(r.errors.join(" "));
  return applyOption(base, r.options[0]).project;
}
const SVG_OK = (s: string) => expect(s.startsWith("<svg") && s.endsWith("</svg>") && !/NaN|undefined|Infinity/.test(s)).toBe(true);

describe("design review", () => {
  it("flags a bedroom without a window and the fix adds one without breaking validation", () => {
    let p = house(12, 15, 1, 2);
    const f = p.floors[0];
    const bed = f.rooms.find((r) => r.type === "bedroom" || r.type === "master-bedroom")!;
    // remove every window
    p = { ...p, floors: [{ ...f, openings: f.openings.filter((o) => o.kind !== "window") }] };
    const before = reviewProject(p).filter((x) => x.roomId === bed.id && x.rule === "Daylight & ventilation");
    expect(before.length).toBe(1);
    expect(before[0].level).toBe("attention");
    const errs0 = validateProject(p).filter((i) => i.severity === "error").length;
    const r = applyWindowFix(p, f.id, bed.id);
    if ("error" in r) throw new Error(r.error);
    expect(r.project.floors[0].openings.length).toBe(p.floors[0].openings.length + 1);
    expect(validateProject(r.project).filter((i) => i.severity === "error").length).toBeLessThanOrEqual(errs0);
    expect(reviewProject(r.project).filter((x) => x.roomId === bed.id && x.rule === "Daylight & ventilation" && x.level === "attention").length).toBe(0);
  });
  it("does not alter the project when reviewing, and reports stairs problems on multi-floor plans", () => {
    const p = house(11, 14, 2, 3);
    const snap = JSON.stringify(p);
    reviewProject(p);
    expect(JSON.stringify(p)).toBe(snap);
    const noStairs = { ...p, floors: [p.floors[0], { ...p.floors[1], rooms: p.floors[1].rooms.filter((r) => r.type !== "staircase") }] };
    expect(reviewProject(noStairs).some((x) => x.rule === "Stairs")).toBe(true);
  });
  it("an empty project gives no findings and the fix refuses a missing room", () => {
    const p = createProject({ name: "E", unitSystem: "metric", buildingType: "duplex", plotWidth: 10, plotDepth: 10, floors: 1, targetBudget: null });
    expect(reviewProject(p)).toEqual([]);
    expect("error" in applyWindowFix(p, p.floors[0].id, "nope")).toBe(true);
  });
});

describe("interior", () => {
  it("furniture stays inside its room and never overlaps, on many plot sizes", () => {
    for (const [w, d, fl, b] of [[9, 12, 1, 1], [12, 15, 2, 3], [15, 20, 2, 4], [8, 10, 1, 2]] as const) {
      let p: Project;
      try { p = house(w, d, fl, b); } catch { continue; }
      for (const ri of planProjectInterior(p)) {
        const room = p.floors.flatMap((f) => f.rooms).find((r) => r.id === ri.roomId)!;
        ri.items.forEach((i, a) => {
          expect(i.x).toBeGreaterThanOrEqual(room.x - 1e-6);
          expect(i.y).toBeGreaterThanOrEqual(room.y - 1e-6);
          expect(i.x + i.width).toBeLessThanOrEqual(room.x + room.width + 1e-6);
          expect(i.y + i.depth).toBeLessThanOrEqual(room.y + room.depth + 1e-6);
          ri.items.slice(a + 1).forEach((j) => {
            const hit = i.x < j.x + j.width - 1e-6 && j.x < i.x + i.width - 1e-6 && i.y < j.y + j.depth - 1e-6 && j.y < i.y + i.depth - 1e-6;
            expect(hit).toBe(false);
          });
        });
      }
    }
  });
  it("makes sheets and a schedule", () => {
    const p = house(12, 15, 2, 3);
    p.floors.forEach((f) => SVG_OK(interiorSvg(p, f.id)));
    expect(furnitureCsv(p).split("\n").length).toBeGreaterThan(3);
    expect(planProjectInterior(p).some((r) => r.items.some((i) => /bed/i.test(i.name)))).toBe(true);
  });
});

describe("elevations", () => {
  it("draws all four views for single and multi floor plans, and for an empty plan", () => {
    for (const p of [house(10, 12, 1, 2), house(12, 15, 2, 3)]) for (const v of ELEVATION_VIEWS) { const s = elevationSvg(p, v.id); SVG_OK(s); expect(s).toContain(v.label); }
    const e = createProject({ name: "E", unitSystem: "imperial", buildingType: "duplex", plotWidth: 10, plotDepth: 10, floors: 1, targetBudget: null });
    ELEVATION_VIEWS.forEach((v) => SVG_OK(elevationSvg(e, v.id)));
  });
});

describe("material estimate", () => {
  it("never invents prices and multiplies quantity by the entered rate", () => {
    let p = house(12, 15, 2, 3);
    const t0 = buildTakeoff(p);
    expect(t0.grandTotal).toBe(0);
    expect(t0.lines.every((l) => l.rate === null && l.amount === null)).toBe(true);
    expect(t0.unrated.length).toBeGreaterThan(5);
    const bricks = t0.lines.find((l) => l.key === "mat-bricks")!;
    expect(bricks.quantity).toBeGreaterThan(0);
    p = setRate(p, "mat-bricks", 10);
    const t1 = buildTakeoff(p);
    expect(t1.lines.find((l) => l.key === "mat-bricks")!.amount).toBeCloseTo(bricks.quantity * 10, 1);
    expect(t1.materialTotal).toBeCloseTo(bricks.quantity * 10, 1);
    p = setMaterials(p, { labourPct: 20, contingencyPct: 10, taxPct: 5 });
    const t2 = buildTakeoff(p);
    const m = t2.materialTotal, lab = m * 0.2, con = (m + lab) * 0.1, tax = (m + lab + con) * 0.05;
    expect(t2.grandTotal).toBeCloseTo(m + lab + con + tax, 1);
    expect(takeoffCsv(p)).toContain("Grand total");
    SVG_OK(materialsSvg(p));
  });
  it("brick count follows wall volume, and more wastage means more bricks", () => {
    const p = house(10, 12, 1, 2);
    const a = buildTakeoff(p).lines.find((l) => l.key === "mat-bricks")!.quantity;
    const b = buildTakeoff(setMaterials(p, { masonryWastePct: 25 })).lines.find((l) => l.key === "mat-bricks")!.quantity;
    expect(b / a).toBeCloseTo(1.25 / 1.05, 2);
  });
  it("settings are sanitised, kept when invalid, and survive a save and load", () => {
    expect(sanitizeMaterials("x")).toBeUndefined();
    const s = sanitizeMaterials({ labourPct: 9999, tileWastePct: -3, paintCoats: 3 })!;
    expect(s.labourPct).toBe(0);
    expect(s.tileWastePct).toBe(8);
    expect(s.paintCoats).toBe(3);
    let p = house(10, 12, 1, 2);
    p = setMaterials(p, { paintCoats: 4, labourPct: 999999 });
    expect(p.materials!.paintCoats).toBe(4);
    expect(p.materials!.labourPct).toBe(0);
    const r = parseProjectJson(serializeProject(p));
    if (!r.ok) throw new Error(r.errors.join());
    expect(materialsOf(r.project).paintCoats).toBe(4);
    const plain = parseProjectJson(serializeProject(house(10, 12, 1, 2)));
    if (!plain.ok) throw new Error("x");
    expect(plain.project.materials).toBeUndefined();
  });
});

describe("history", () => {
  it("keeps snapshots, caps them, restores and compares", () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } };
    const p = house(12, 15, 2, 3);
    expect(loadSnapshots(p.id)).toEqual([]);
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) addSnapshot(p, `v${i}`, "", i % 2 === 0);
    const list = loadSnapshots(p.id);
    expect(list.length).toBe(MAX_SNAPSHOTS);
    expect(list[list.length - 1].label).toBe(`v${MAX_SNAPSHOTS + 4}`);
    const back = snapshotProject(list[0]);
    if (!back.ok) throw new Error(back.error);
    expect(back.project.floors.length).toBe(2);
    expect(compareProjects(back.project, p)).toEqual([]);
    const smaller = { ...p, floors: [p.floors[0]] };
    expect(compareProjects(p, smaller).some((d) => d.field === "floors")).toBe(true);
    expect(snapshotProject({ ...list[0], project: { junk: true } }).ok).toBe(false);
    mem.set(`bv_history_${p.id}`, "not json");
    expect(loadSnapshots(p.id)).toEqual([]);
  });
});

describe("AI review helpers", () => {
  it("reads good answers, rejects bad ones and caps sizes", () => {
    expect(parseReview(null)).toBeNull();
    expect(parseReview({ suggestions: [] })).toBeNull();
    expect(parseReview({ suggestions: [{ title: 1 }] })).toBeNull();
    const r = parseReview({ summary: "s".repeat(900), suggestions: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`.repeat(50), detail: "d".repeat(900), priority: i === 0 ? "high" : "weird" })) })!;
    expect(r.suggestions.length).toBe(8);
    expect(r.summary.length).toBe(300);
    expect(r.suggestions[1].priority).toBe("medium");
    expect(r.suggestions[0].detail.length).toBe(260);
  });
  it("describes the plan compactly without personal data", () => {
    const p = house(12, 15, 2, 3);
    const d = describeProject({ ...p, name: "secret-name@example.com" });
    expect(d).not.toContain("secret-name");
    expect(d.length).toBeLessThanOrEqual(6000);
  });
});
