import { describe, expect, it } from "vitest";
import { applyOption } from "@/lib/layout/autodesign";
import { createProject } from "@/lib/model/ops";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { parseProject, serializeProject } from "@/lib/model/schema";
import { DEFAULT_ENGINE_INPUT, generateEngineOptions } from "@/lib/layout/engine/solver";
import { scoreAdjacency, MIN_SHARED } from "@/lib/layout/engine/adjacency";
import { directionalScore } from "@/lib/layout/engine/directional";
import { efficiencyScore, economyScore } from "@/lib/layout/engine/objectives";
import { applyRegen, freeRects, regenerateUnlocked } from "@/lib/layout/engine/regen";
import type { Project, Room } from "@/lib/model/types";

const room = (id: string, type: Room["type"], x: number, y: number, width: number, depth: number): Room => ({ id, type, name: id, x, y, width, depth });
const blank = (w: number, d: number, floors: number) => createProject({ name: "t", plotWidth: w, plotDepth: d, floors, buildingType: "custom", unitSystem: "metric", targetBudget: null } as never);
const area = (r: { width: number; depth: number }) => r.width * r.depth;

function lockedProject(): { p: Project; fid: string } {
  const res = generateEngineOptions({ width: 12, depth: 15 }, { ...DEFAULT_ENGINE_INPUT, floors: 2, bedrooms: 3 });
  const p0 = applyOption(blank(12, 15, 2), res.options[0]).project;
  const p = { ...p0, floors: p0.floors.map((f, i) => (i === 0 ? { ...f, rooms: f.rooms.map((r) => (r.type === "living" || r.type === "staircase" ? { ...r, locked: true } : r)) } : f)) };
  return { p, fid: p.floors[0].id };
}

describe("engine2: adjacency", () => {
  it("rewards wanted neighbours and penalises unwanted ones", () => {
    const good = scoreAdjacency([[room("k", "kitchen", 0, 0, 3, 3), room("d", "dining", 3, 0, 3, 3)]]);
    const bad = scoreAdjacency([[room("k", "kitchen", 0, 0, 3, 3), room("b", "bedroom", 3, 0, 3, 3)]]);
    expect(good.raw).toBeGreaterThan(0);
    expect(good.score).toBeGreaterThan(50);
    expect(bad.raw).toBeLessThan(0);
    expect(bad.score).toBeLessThan(50);
  });
  it("ignores rooms that only touch at a corner or share less than a door width", () => {
    expect(MIN_SHARED).toBe(0.9);
    const r = scoreAdjacency([[room("k", "kitchen", 0, 0, 3, 3), room("d", "dining", 3, 3, 3, 3)]]);
    expect(r.raw).toBe(0);
    const r2 = scoreAdjacency([[room("k", "kitchen", 0, 0, 3, 3), room("d", "dining", 3, 2.5, 3, 3)]]);
    expect(r2.raw).toBe(0);
  });
  it("lets the user override weights", () => {
    const rooms = [[room("k", "kitchen", 0, 0, 3, 3), room("d", "dining", 3, 0, 3, 3)]];
    const r = scoreAdjacency(rooms, { "dining|kitchen": 10 });
    expect(r.raw).toBe(10);
  });
});

describe("engine2: objectives and options", () => {
  it("efficiency is the share of non-circulation area", () => {
    expect(efficiencyScore(0)).toBe(100);
    expect(efficiencyScore(0.25)).toBe(75);
    expect(efficiencyScore(2)).toBe(0);
  });
  it("economy stays within 0..100", () => {
    const m = { circRatio: 0.1, alignRatio: 1, wetGrouped: 1, wetStacked: 1, columns: 6, footprintArea: 100 };
    expect(economyScore(m, 6, 12)).toBe(100);
    expect(economyScore({ ...m, alignRatio: 0, wetGrouped: 0, wetStacked: 0, columns: 12 }, 6, 12)).toBe(0);
  });
  it("returns distinct, labelled options with scores", () => {
    const res = generateEngineOptions({ width: 12, depth: 15 }, { ...DEFAULT_ENGINE_INPUT, floors: 2, bedrooms: 3 });
    expect(res.options.length).toBeGreaterThanOrEqual(2);
    expect(res.options[0].label.startsWith("Option A")).toBe(true);
    expect(new Set(res.options.map((o) => o.label)).size).toBe(res.options.length);
    expect(new Set(res.options.map((o) => o.id)).size).toBe(res.options.length);
    expect(res.options[0].notes.length).toBeGreaterThan(0);
  });
  it("directional toggle keeps every option valid and reports unmet directions", () => {
    const on = generateEngineOptions({ width: 12, depth: 15 }, { ...DEFAULT_ENGINE_INPUT, floors: 2, bedrooms: 3, directional: true });
    const off = generateEngineOptions({ width: 12, depth: 15 }, { ...DEFAULT_ENGINE_INPUT, floors: 2, bedrooms: 3, directional: false });
    expect(on.errors).toEqual([]);
    expect(off.errors).toEqual([]);
    for (const o of on.options) expect(countBySeverity(validateProject(applyOption(blank(12, 15, 2), o).project)).error).toBe(0);
    expect(on.options[0].notes.join(" ").toLowerCase()).toContain("directional");
  });
  it("directionalScore is 0..100 and neutral for an empty plan", () => {
    expect(directionalScore([], [], 0).score).toBe(50);
    const d = directionalScore([[room("a", "kitchen", 0, 0, 3, 3), room("b", "living", 3, 0, 4, 4)]], [], 0);
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(100);
  });
});

describe("engine2: free rectangles", () => {
  it("conserves area and avoids the locked rectangle", () => {
    const outline = { x: 0, y: 0, width: 10, depth: 8 };
    const lock = { x: 3, y: 2, width: 4, depth: 3 };
    const f = freeRects(outline, [lock]);
    expect(f.reduce((s, r) => s + area(r), 0)).toBeCloseTo(80 - 12, 6);
    for (const r of f) {
      const ox = Math.min(r.x + r.width, lock.x + lock.width) - Math.max(r.x, lock.x);
      const oy = Math.min(r.y + r.depth, lock.y + lock.depth) - Math.max(r.y, lock.y);
      expect(ox > 1e-6 && oy > 1e-6).toBe(false);
    }
  });
  it("returns the whole outline when nothing is locked", () => {
    const f = freeRects({ x: 0, y: 0, width: 5, depth: 5 }, []);
    expect(f.reduce((s, r) => s + area(r), 0)).toBeCloseTo(25, 6);
  });
});

describe("engine2: lock and regenerate", () => {
  it("keeps locked rooms exactly, keeps ids, tiles the floor and is deterministic", () => {
    const { p, fid } = lockedProject();
    const floor = p.floors[0];
    const a = regenerateUnlocked(p, fid, {});
    const b = regenerateUnlocked(p, fid, {});
    expect(a.errors).toEqual([]);
    expect(a.options.length).toBeGreaterThan(0);
    expect(a.lockedCount).toBe(2);
    expect(JSON.stringify(a.options.map((o) => o.rooms))).toBe(JSON.stringify(b.options.map((o) => o.rooms)));
    const total = floor.rooms.reduce((s, r) => s + area(r), 0);
    for (const o of a.options) {
      expect(o.rooms.map((r) => r.id).sort()).toEqual(floor.rooms.map((r) => r.id).sort());
      for (const r of floor.rooms.filter((x) => x.locked)) {
        const n = o.rooms.find((x) => x.id === r.id)!;
        expect([n.x, n.y, n.width, n.depth]).toEqual([r.x, r.y, r.width, r.depth]);
      }
      expect(o.rooms.reduce((s, r) => s + area(r), 0)).toBeCloseTo(total, 1);
      for (const r of o.rooms) { const orig = floor.rooms.find((x) => x.id === r.id)!; expect(r.name).toBe(orig.name); expect(r.type).toBe(orig.type); }
    }
  });
  it("applies cleanly: no validator errors, no failed openings, other floors untouched", () => {
    const { p, fid } = lockedProject();
    const a = regenerateUnlocked(p, fid, {});
    for (const o of a.options) {
      const r = applyRegen(p, fid, o);
      expect(r.failed).toEqual([]);
      expect(countBySeverity(validateProject(r.project)).error).toBe(0);
      expect(JSON.stringify(r.project.floors[1])).toBe(JSON.stringify(p.floors[1]));
    }
  });
  it("explains why it cannot run", () => {
    const { p, fid } = lockedProject();
    const allLocked = { ...p, floors: p.floors.map((f, i) => (i === 0 ? { ...f, rooms: f.rooms.map((r) => ({ ...r, locked: true })) } : f)) };
    expect(regenerateUnlocked(allLocked, fid, {}).errors.length).toBe(1);
    expect(regenerateUnlocked(p, "nope", {}).errors.length).toBe(1);
    const noLock = { ...p, floors: p.floors.map((f, i) => (i === 0 ? { ...f, rooms: f.rooms.map((r) => ({ ...r, locked: undefined })) } : f)) };
    const rr = regenerateUnlocked(noLock, fid, {});
    expect(rr.lockedCount).toBe(0);
    const ov = { ...p, floors: p.floors.map((f, i) => {
      if (i !== 0) return f;
      const ls = f.rooms.filter((r) => r.locked);
      return { ...f, rooms: f.rooms.map((r) => (r.id === ls[1].id ? { ...r, x: ls[0].x, y: ls[0].y } : r)) };
    }) };
    expect(regenerateUnlocked(ov, fid, {}).errors.join(" ")).toContain("overlap");
  });
});

describe("engine2: locked flag persistence", () => {
  it("survives save and load", () => {
    const { p } = lockedProject();
    const back = parseProject(JSON.parse(serializeProject(p)));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.project.floors[0].rooms.filter((r) => r.locked).length).toBe(2);
      expect(back.project.floors[1].rooms.some((r) => r.locked)).toBe(false);
    }
  });
});
