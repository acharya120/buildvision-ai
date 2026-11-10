import { describe, expect, it } from "vitest";
import {
  boundingBox,
  isInsidePlot,
  isValidRect,
  overlapArea,
  rectArea,
  rectsOverlap,
  sharedEdgeLength,
  snapValue,
  uncoveredArea,
} from "@/lib/geometry/rect";
import { generateWallsFromRooms, wallLength, wallSolids } from "@/lib/geometry/walls";
import { makeRoom } from "@/lib/model/defaults";
import type { Wall } from "@/lib/model/types";

const R = (x: number, y: number, width: number, depth: number) => ({ x, y, width, depth });

describe("rectangles", () => {
  it("computes area", () => {
    expect(rectArea(R(0, 0, 4, 3))).toBe(12);
  });
  it("rejects zero, negative and non-finite sizes", () => {
    expect(isValidRect(R(0, 0, 0, 3))).toBe(false);
    expect(isValidRect(R(0, 0, -1, 3))).toBe(false);
    expect(isValidRect(R(0, 0, NaN, 3))).toBe(false);
    expect(isValidRect(R(0, 0, 2, 3))).toBe(true);
  });
  it("detects inside / outside the plot with 1 mm tolerance", () => {
    const plot = { width: 10, depth: 10 };
    expect(isInsidePlot(R(0, 0, 10, 10), plot)).toBe(true);
    expect(isInsidePlot(R(0, 0, 10.0005, 10), plot)).toBe(true);
    expect(isInsidePlot(R(0, 0, 10.01, 10), plot)).toBe(false);
    expect(isInsidePlot(R(-0.5, 0, 2, 2), plot)).toBe(false);
  });
  it("treats touching rooms as NOT overlapping", () => {
    expect(rectsOverlap(R(0, 0, 3, 3), R(3, 0, 3, 3))).toBe(false);
    expect(rectsOverlap(R(0, 0, 3, 3), R(2.5, 0, 3, 3))).toBe(true);
    expect(overlapArea(R(0, 0, 3, 3), R(2, 2, 3, 3))).toBeCloseTo(1, 9);
    expect(overlapArea(R(0, 0, 1, 1), R(5, 5, 1, 1))).toBe(0);
  });
  it("measures a shared edge only when rooms touch", () => {
    expect(sharedEdgeLength(R(0, 0, 3, 3), R(3, 1, 3, 3))).toBeCloseTo(2, 9);
    expect(sharedEdgeLength(R(0, 0, 3, 3), R(3.5, 0, 3, 3))).toBe(0);
    expect(sharedEdgeLength(R(0, 0, 3, 3), R(1, 3, 4, 2))).toBeCloseTo(2, 9);
  });
  it("computes uncovered area exactly", () => {
    expect(uncoveredArea(R(0, 0, 4, 4), [])).toBeCloseTo(16, 9);
    expect(uncoveredArea(R(0, 0, 4, 4), [R(0, 0, 4, 4)])).toBeCloseTo(0, 9);
    expect(uncoveredArea(R(0, 0, 4, 4), [R(0, 0, 2, 4), R(2, 0, 2, 2)])).toBeCloseTo(4, 9);
    expect(uncoveredArea(R(0, 0, 4, 4), [R(-5, -5, 20, 20)])).toBeCloseTo(0, 9);
  });
  it("snaps and bounds", () => {
    expect(snapValue(1.04, 0.15)).toBeCloseTo(1.05, 9);
    expect(snapValue(1.0, 0.5)).toBeCloseTo(1.0, 9);
    expect(snapValue(1.2, 0)).toBe(1.2);
    expect(boundingBox([R(1, 1, 2, 2), R(4, 0, 1, 5)])).toEqual({ x: 1, y: 0, width: 4, depth: 5 });
    expect(boundingBox([])).toBeNull();
  });
});

describe("walls", () => {
  it("generates one wall per room edge and merges shared edges", () => {
    const a = makeRoom("living", 0, 0, { width: 4, depth: 3 });
    const b = makeRoom("kitchen", 4, 0, { width: 3, depth: 3 });
    const walls = generateWallsFromRooms([a, b], 0.115);
    // top (merged 0..7), bottom (merged 0..7), left, shared middle, right  => 5 walls
    expect(walls).toHaveLength(5);
    const total = walls.reduce((s, w) => s + wallLength(w), 0);
    expect(total).toBeCloseTo(7 + 7 + 3 + 3 + 3, 6);
    expect(new Set(walls.map((w) => w.id)).size).toBe(walls.length);
    expect(walls.every((w) => w.auto)).toBe(true);
  });
  it("ignores invalid rooms", () => {
    const bad = makeRoom("custom", 0, 0, { width: 0, depth: 3 });
    expect(generateWallsFromRooms([bad], 0.1)).toHaveLength(0);
  });
  it("splits a wall around openings", () => {
    const wall: Wall = { id: "w", x1: 0, y1: 0, x2: 5, y2: 0, thickness: 0.1, auto: false };
    const door = { id: "d", wallId: "w", kind: "door" as const, offset: 1, width: 1, height: 2.1, sill: 0 };
    const win = { id: "x", wallId: "w", kind: "window" as const, offset: 3, width: 1, height: 1, sill: 1 };
    const solids = wallSolids(wall, [door, win], 3);
    // full left | above door | full middle | below window | above window | full right
    expect(solids).toHaveLength(6);
    const area = solids.reduce((s, p) => s + (p.a1 - p.a0) * (p.z1 - p.z0), 0);
    expect(area).toBeCloseTo(5 * 3 - 1 * 2.1 - 1 * 1, 9);
  });
  it("returns a single solid for a wall with no openings", () => {
    const wall: Wall = { id: "w", x1: 0, y1: 0, x2: 0, y2: 4, thickness: 0.1, auto: false };
    expect(wallSolids(wall, [], 3)).toEqual([{ a0: 0, a1: 4, z0: 0, z1: 3 }]);
  });
});
