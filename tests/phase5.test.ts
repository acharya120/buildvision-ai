import { describe, expect, it } from "vitest";
import { applyOption } from "@/lib/layout/autodesign";
import { DEFAULT_ENGINE_INPUT, generateEngineOptions } from "@/lib/layout/engine/solver";
import { createProject } from "@/lib/model/ops";
import { ROOM_TYPE_LABELS } from "@/lib/model/defaults";
import { planToSvg } from "@/lib/export/svg";
import { planSheetSvg } from "@/lib/export/sheet";
import { LANGS, ROOM_NAMES, floorLabel, localRoomName } from "@/lib/i18n/labels";
import type { Project } from "@/lib/model/types";

const blank = (w: number, d: number, floors: number) => createProject({ name: "t & <x>", plotWidth: w, plotDepth: d, floors, buildingType: "custom", unitSystem: "metric", targetBudget: null } as never);
function proj(floors: number): Project {
  const res = generateEngineOptions({ width: 12, depth: 15 }, { ...DEFAULT_ENGINE_INPUT, floors, bedrooms: 3 });
  return applyOption(blank(12, 15, floors), res.options[0]).project;
}
const norm = (s: string) => s.replace(/view\d+/g, "view");
const nan = (s: string) => /NaN|undefined/.test(s);
const balanced = (s: string) => (s.match(/<svg[\s>]/g) ?? []).length === (s.match(/<\/svg>/g) ?? []).length;

describe("phase5: label languages", () => {
  it("has a translation for every room type in every language", () => {
    for (const l of LANGS.filter((x) => x.code !== "en")) {
      for (const t of Object.keys(ROOM_TYPE_LABELS)) {
        const v = (ROOM_NAMES as Record<string, Record<string, string>>)[l.code][t];
        expect(typeof v === "string" && v.trim().length > 0).toBe(true);
      }
    }
  });
  it("translates default names only, keeps numbers, leaves custom names and English alone", () => {
    expect(localRoomName({ name: "Bedroom", type: "bedroom" }, "en")).toBe("Bedroom");
    expect(localRoomName({ name: "Bedroom", type: "bedroom" }, "hi")).not.toBe("Bedroom");
    expect(localRoomName({ name: "Rahul's den", type: "bedroom" }, "hi")).toBe("Rahul's den");
    const n = localRoomName({ name: "Bedroom 2", type: "bedroom" }, "mr");
    expect(n.endsWith(" 2")).toBe(true);
    expect(n).not.toBe("Bedroom 2");
  });
  it("translates default floor names only", () => {
    expect(floorLabel("Ground Floor", 0, "hi")).not.toBe("Ground Floor");
    expect(floorLabel("My roof deck", 0, "hi")).toBe("My roof deck");
    expect(floorLabel("Ground Floor", 0, "en")).toBe("Ground Floor");
  });
});

describe("phase5: drawing output", () => {
  it("default drawing does not change when no new options are given", () => {
    const p = proj(1); const f = p.floors[0].id;
    expect(norm(planToSvg(p, f, { lang: "en" }))).toBe(norm(planToSvg(p, f)));
  });
  it("Hindi output has Devanagari and drops the English default names", () => {
    const p = proj(1); const f = p.floors[0].id;
    const s = planToSvg(p, f, { lang: "hi" });
    expect(/[ऀ-ॿ]/.test(s)).toBe(true);
    expect(s.includes(">Living")).toBe(false);
    expect(nan(s)).toBe(false);
  });
  it("detailed bright mode adds more drawing than classic", () => {
    const p = proj(2); const f = p.floors[0].id;
    const a = planToSvg(p, f, {}); const b = planToSvg(p, f, { detailed: true, style: "bright" });
    expect(b.length).toBeGreaterThan(a.length);
    expect(b.includes("#f2c200")).toBe(true);
    expect(nan(b)).toBe(false);
  });
  it("all-floors sheet: one nested drawing per floor, balanced, no NaN, XML-safe", () => {
    for (const n of [1, 2]) {
      const p = proj(n);
      const s = planSheetSvg(p, { lang: "ta", style: "bright", detailed: true });
      expect(balanced(s)).toBe(true);
      expect((s.match(/<svg[\s>]/g) ?? []).length).toBe(n + 1);
      expect(nan(s)).toBe(false);
      expect(s.includes("t & <x>")).toBe(false);
    }
  });
  it("works in imperial units", () => {
    const p = { ...proj(2), unitSystem: "imperial" as const };
    const s = planSheetSvg(p, { lang: "te", detailed: true });
    expect(nan(s)).toBe(false);
    expect(balanced(s)).toBe(true);
  });
});
