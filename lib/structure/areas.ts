import type { Floor, Project } from "../model/types";
import { plotArea } from "../model/plotShapes";

/**
 * Plan areas and floor area ratio (FAR), worked out from the rooms on every floor.
 * Built-up area of a floor = the union of its rooms, each grown outwards by half the outside wall
 * thickness (rooms are measured to wall centre-lines), so shared walls are not counted twice.
 * Rules differ by city (exempt stairs, parking, balconies, etc.): this uses every floor in full,
 * so check the figure against your local authority's rules.
 */
export interface FloorAreas {
  name: string;
  roomArea: number;
  builtUp: number;
}
export interface AreaSummary {
  plotArea: number;
  floors: FloorAreas[];
  totalBuiltUp: number;
  /** total built-up area / plot area */
  far: number;
  /** ground floor built-up area as % of the plot */
  coveragePct: number;
  /** plot area not covered by the ground floor, m2 */
  openArea: number;
}

/** area of the union of axis-aligned rectangles (coordinate compression) */
export function unionArea(rects: Array<{ x0: number; y0: number; x1: number; y1: number }>): number {
  if (!rects.length) return 0;
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1)) total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  return total;
}

export function floorBuiltUp(floor: Floor, extThickness: number): number {
  const g = extThickness / 2;
  return unionArea(floor.rooms.map((r) => ({ x0: r.x - g, y0: r.y - g, x1: r.x + r.width + g, y1: r.y + r.depth + g })));
}

export function areaSummary(p: Project): AreaSummary {
  const plotAreaM2 = plotArea(p.plot);
  const t = p.settings.exteriorWallThickness;
  const floors = p.floors.map((f) => ({
    name: f.name,
    roomArea: f.rooms.reduce((a, r) => a + r.width * r.depth, 0),
    builtUp: floorBuiltUp(f, t),
  }));
  const totalBuiltUp = floors.reduce((a, f) => a + f.builtUp, 0);
  const ground = floors[0]?.builtUp ?? 0;
  return {
    plotArea: plotAreaM2,
    floors,
    totalBuiltUp,
    far: plotAreaM2 > 0 ? totalBuiltUp / plotAreaM2 : 0,
    coveragePct: plotAreaM2 > 0 ? (ground / plotAreaM2) * 100 : 0,
    openArea: Math.max(0, plotAreaM2 - ground),
  };
}
