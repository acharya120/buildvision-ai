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
