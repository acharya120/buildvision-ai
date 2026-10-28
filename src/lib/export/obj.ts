import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { wallDir, wallLength, wallSolids } from "../geometry/walls";
import { floorElevations } from "./drawings";

type V3 = [number, number, number];

/**
 * Wavefront OBJ of the building: one slab per room and the wall solids (with door/window gaps).
 * Mapping: plan x -> OBJ x, up -> OBJ y, plan y -> OBJ z. Units: metres.
 */
export function buildObj(p: Project): string {
  const lines: string[] = ["# BuildVision AI export (conceptual model, metres, Y up)", `# Project: ${p.name.replace(/[\r\n]/g, " ")}`];
  let offset = 0;
  let group = 0;

  const box = (name: string, c: V3[]) => {
    // c: 8 corners, 0-3 bottom ring (counter-clockwise from above), 4-7 top ring
    lines.push(`o ${name}_${group++}`);
    for (const v of c) lines.push(`v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}`);
    const f = (a: number, b: number, cc: number, d: number) => lines.push(`f ${offset + a} ${offset + b} ${offset + cc} ${offset + d}`);
    f(1, 4, 3, 2); // bottom
    f(5, 6, 7, 8); // top
    f(1, 2, 6, 5);
    f(2, 3, 7, 6);
    f(3, 4, 8, 7);
    f(4, 1, 5, 8);
    offset += 8;
  };

  const elev = floorElevations(p);
  p.floors.forEach((f, i) => {
    const base = elev[i];
    for (const r of f.rooms.filter(isValidRect)) {
      const t = 0.12;
      const x1 = r.x;
      const x2 = r.x + r.width;
      const z1 = r.y;
      const z2 = r.y + r.depth;
      box(`slab_${f.name.replace(/\s+/g, "_")}`, [
        [x1, base - t, z1], [x2, base - t, z1], [x2, base - t, z2], [x1, base - t, z2],
        [x1, base, z1], [x2, base, z1], [x2, base, z2], [x1, base, z2],
      ]);
    }
    for (const w of f.walls) {
      if (wallLength(w) < 1e-6) continue;
      const d = wallDir(w);
      const nx = -d.y * (w.thickness / 2);
      const ny = d.x * (w.thickness / 2);
      for (const s of wallSolids(w, f.openings, f.height)) {
        const ax = w.x1 + d.x * s.a0;
        const ay = w.y1 + d.y * s.a0;
        const bx = w.x1 + d.x * s.a1;
        const by = w.y1 + d.y * s.a1;
        const lo = base + s.z0;
        const hi = base + s.z1;
        // ring in plan (x,y): a-left, b-left, b-right, a-right
        const ring: Array<[number, number]> = [
          [ax + nx, ay + ny],
          [bx + nx, by + ny],
          [bx - nx, by - ny],
          [ax - nx, ay - ny],
        ];
        // make the ring counter-clockwise when seen from above (OBJ x,z), whatever the wall direction
        const area = ring.reduce((sum, pt, k) => {
          const q = ring[(k + 1) % 4];
          return sum + (pt[0] * q[1] - q[0] * pt[1]);
        }, 0);
        const ordered = area < 0 ? [...ring].reverse() : ring;
        box(`wall_${f.name.replace(/\s+/g, "_")}`, [
          ...ordered.map((pt): V3 => [pt[0], lo, pt[1]]),
          ...ordered.map((pt): V3 => [pt[0], hi, pt[1]]),
        ]);
      }
    }
  });
  return lines.join("\n") + "\n";
}
