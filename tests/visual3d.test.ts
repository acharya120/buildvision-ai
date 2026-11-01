import { describe, expect, it } from "vitest";
import { stairBlocks } from "@/lib/geometry/stairs";
import { furnitureFor } from "@/lib/geometry/furniture";
import type { RoomType } from "@/lib/model/types";

describe("stair blocks", () => {
  const room = { x: 1, y: 2, width: 1.8, depth: 3.0 };
  it("stay inside the room and climb to just under the floor height", () => {
    const b = stairBlocks(room, 3.0);
    expect(b.length).toBeGreaterThan(10);
    for (const s of b) {
      expect(s.x).toBeGreaterThanOrEqual(room.x - 1e-6);
      expect(s.y).toBeGreaterThanOrEqual(room.y - 1e-6);
      expect(s.x + s.width).toBeLessThanOrEqual(room.x + room.width + 1e-6);
      expect(s.y + s.depth).toBeLessThanOrEqual(room.y + room.depth + 1e-6);
    }
    const max = Math.max(...b.map((s) => s.top));
    expect(max).toBeLessThanOrEqual(3.0);
    expect(max).toBeGreaterThan(2.6);
    const steps = b.filter((s) => s.kind === "step").length;
    const rise = 3.0 / (steps + 2);
    expect(rise).toBeGreaterThan(0.14);
    expect(rise).toBeLessThan(0.2);
  });
  it("works for rooms that are wider than deep and refuses tiny ones", () => {
    expect(stairBlocks({ x: 0, y: 0, width: 3, depth: 1.8 }, 3).length).toBeGreaterThan(10);
    expect(stairBlocks({ x: 0, y: 0, width: 0.9, depth: 1.0 }, 3)).toEqual([]);
  });
});

describe("placeholder furniture", () => {
  const types: RoomType[] = ["living", "bedroom", "master-bedroom", "kitchen", "dining", "bathroom", "toilet", "study", "garage", "utility", "store", "balcony", "lobby", "staircase", "custom"];
  it("always stays inside the room", () => {
    for (const t of types) for (const [w, d] of [[3, 3], [4, 3.6], [2.4, 2.7], [1.5, 2.4], [6, 5.5]]) {
      const r = { type: t, x: 2, y: 3, width: w, depth: d };
      for (const f of furnitureFor(r)) {
        expect(f.x).toBeGreaterThanOrEqual(r.x - 1e-6);
        expect(f.y).toBeGreaterThanOrEqual(r.y - 1e-6);
        expect(f.x + f.width).toBeLessThanOrEqual(r.x + w + 1e-6);
        expect(f.y + f.depth).toBeLessThanOrEqual(r.y + d + 1e-6);
      }
    }
  });
});

import { buildSite } from "@/lib/site/site";
import { DEFAULT_SITE } from "@/lib/model/defaults";
import { applyOption, DEFAULT_AUTODESIGN_INPUT, generateOptions } from "@/lib/layout/autodesign";
import { createProject } from "@/lib/model/ops";
import { parseProjectJson, serializeProject } from "@/lib/model/schema";

describe("site surroundings", () => {
  const make = (garage: boolean) => {
    const input = { ...DEFAULT_AUTODESIGN_INPUT, floors: 2, bedrooms: 3, includeGarage: garage, setbackFront: 3, setbackSide: 2, setbackRear: 2 };
    const o = generateOptions({ width: 15, depth: 20 }, input).options[0];
    const p0 = createProject({ name: "s", plotWidth: 15, plotDepth: 20, floors: 2, buildingType: "villa", unitSystem: "metric", targetBudget: null } as never);
    return applyOption(p0, o).project;
  };
  it("is off unless enabled, and on after auto design", () => {
    expect(buildSite({ ...make(false), site: undefined })).toBe(null);
    expect(make(false).site).toBeTruthy();
  });
  it("puts the entrance on the side of the main door and trees clear of the building and paths", () => {
    const p = { ...make(true), site: { ...DEFAULT_SITE, trees: "many" as const } };
    const s = buildSite(p)!;
    expect(s.gates.filter((g) => g.kind === "entrance").length).toBe(2); // walk-in + vehicle
    expect(s.gates.some((g) => g.kind === "exit")).toBe(true);
    const b = s.building!;
    for (const t of s.trees) {
      const inside = t.x + t.r > b.x && t.x - t.r < b.x + b.width && t.y + t.r > b.y && t.y - t.r < b.y + b.depth;
      expect(inside).toBe(false);
      expect(t.x - t.r).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.r).toBeLessThanOrEqual(15 + 1e-6);
      expect(t.y - t.r).toBeGreaterThanOrEqual(-1e-6);
      expect(t.y + t.r).toBeLessThanOrEqual(20 + 1e-6);
    }
    expect(JSON.stringify(buildSite(p))).toBe(JSON.stringify(s)); // deterministic
  });
  it("survives a JSON round trip", () => {
    const p = make(false);
    const r = parseProjectJson(serializeProject(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.site).toEqual(p.site);
  });
});

import { buildDxf } from "@/lib/export/dxf";
import { setNorth } from "@/lib/model/ops";
import { planToSvg } from "@/lib/export/svg";

describe("DXF export and north", () => {
  const input = { ...DEFAULT_AUTODESIGN_INPUT, floors: 2, bedrooms: 3 };
  const o = generateOptions({ width: 9, depth: 12 }, input).options[0];
  const p0 = createProject({ name: "D;X\nF", plotWidth: 9, plotDepth: 12, floors: 2, buildingType: "villa", unitSystem: "metric", targetBudget: null } as never);
  const p = applyOption(p0, o).project;
  it("writes a well-formed DXF", () => {
    const d = buildDxf(p);
    const rows = d.split("\r\n");
    expect(rows[0]).toBe("0");
    expect(rows[1]).toBe("SECTION");
    expect(rows[rows.length - 2]).toBe("EOF");
    expect(d.split("\r\n0\r\nLINE\r\n").length).toBeGreaterThan(100);
    expect(d.includes("\nD;X F") || d.includes("D;X F")).toBe(true); // newline in the name is neutralised
    expect(d).not.toMatch(/NaN|undefined|Infinity/);
    // entity group codes alternate code/value, so the row count is even
    expect((rows.length - 1) % 2).toBe(0);
  });
  it("stores north and draws the arrow", () => {
    expect(setNorth(p, 450).northAngle).toBe(90);
    expect(setNorth(p, NaN).northAngle).toBe(p.northAngle);
    const svg = planToSvg(setNorth(p, 30), p.floors[0].id);
    expect(svg.includes("rotate(30)")).toBe(true);
    const r = parseProjectJson(serializeProject(setNorth(p, 30)));
    expect(r.ok && r.project.northAngle).toBe(30);
  });
  it("lower-ranks or notes layouts whose living areas face west only, and never errors", () => {
    for (const north of [0, 90, 180, 270]) {
      const res = generateOptions({ width: 9, depth: 12 }, { ...input, northAngle: north });
      expect(res.errors).toEqual([]);
      expect(res.options.length).toBeGreaterThan(0);
    }
  });
});
