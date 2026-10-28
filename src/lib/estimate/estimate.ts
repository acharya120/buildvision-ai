import type { EstimateLineItem, Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { wallLength } from "../geometry/walls";
import { sqmToSqft } from "../model/units";

export interface FloorSummary {
  floorId: string;
  name: string;
  roomCount: number;
  roomArea: number; // m2
  wallLength: number; // m
  doorCount: number;
  windowCount: number;
}

export interface Estimate {
  lines: EstimateLineItem[];
  floors: FloorSummary[];
  /** sum of amounts for lines that have a user-entered rate */
  totalCost: number;
  /** names of costable lines that still have no rate */
  unrated: string[];
  /** things that cannot be estimated from the current model */
  unavailable: string[];
  /** difference between target budget and total (null when no budget set) */
  budgetRemaining: number | null;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Transparent quantity estimate derived ONLY from the building model.
 * Cost = quantity x user-entered rate. No default prices are supplied.
 * This is a preliminary take-off, not a bill of quantities or structural specification.
 */
export function buildEstimate(p: Project): Estimate {
  const unavailable: string[] = [
    "Foundations, footings and excavation (need soil data and structural design)",
    "Beams, columns and reinforcement steel (need structural design)",
    "Electrical, plumbing, fixtures, doors/windows frames and finishes other than those listed",
    "Roof finishes, waterproofing, external development and professional fees",
  ];

  const floors: FloorSummary[] = p.floors.map((f) => ({
    floorId: f.id,
    name: f.name,
    roomCount: f.rooms.length,
    roomArea: f.rooms.filter(isValidRect).reduce((s, r) => s + r.width * r.depth, 0),
    wallLength: f.walls.reduce((s, w) => s + wallLength(w), 0),
    doorCount: f.openings.filter((o) => o.kind === "door").length,
    windowCount: f.openings.filter((o) => o.kind === "window").length,
  }));

  let grossWall = 0;
  let openingArea = 0;
  let masonry = 0;
  let wallRunLength = 0;
  let missingWallFloors = 0;
  for (const f of p.floors) {
    if (f.rooms.length && !f.walls.length) missingWallFloors++;
    const wallById = new Map(f.walls.map((w) => [w.id, w]));
    for (const w of f.walls) {
      const len = wallLength(w);
      wallRunLength += len;
      grossWall += len * f.height;
    }
    for (const o of f.openings) {
      if (!wallById.has(o.wallId)) continue;
      const a = Math.max(0, o.width) * Math.max(0, o.height);
      openingArea += a;
    }
    // masonry volume = (wall length x height - openings on that wall) x thickness
    for (const w of f.walls) {
      const len = wallLength(w);
      const opens = f.openings.filter((o) => o.wallId === w.id).reduce((s, o) => s + o.width * o.height, 0);
      masonry += Math.max(0, len * f.height - opens) * w.thickness;
    }
  }
  if (missingWallFloors > 0) {
    unavailable.push(`Wall quantities are incomplete: ${missingWallFloors} floor(s) have rooms but no walls. Use "Generate walls".`);
  }

  const plotArea = p.plot.width * p.plot.depth;
  const builtUp = floors.reduce((s, f) => s + f.roomArea, 0);
  const netWall = Math.max(0, grossWall - openingArea);
  const plaster = netWall * 2;
  const paintable = plaster * (1 - Math.min(100, Math.max(0, p.settings.estimate.paintExtraDeductionPct)) / 100);
  const doors = floors.reduce((s, f) => s + f.doorCount, 0);
  const windows = floors.reduce((s, f) => s + f.windowCount, 0);

  const rate = (key: string): number | null => (p.rates[key] != null && p.rates[key] >= 0 ? p.rates[key] : null);
  const line = (
    key: string,
    name: string,
    quantity: number,
    unit: string,
    basis: EstimateLineItem["basis"],
    costable: boolean,
    note: string,
  ): EstimateLineItem => {
    const r = costable ? rate(key) : null;
    const q = round3(quantity);
    return { key, name, quantity: q, unit, rate: r, amount: r != null ? Math.round(q * r * 100) / 100 : null, basis, costable, note };
  };

  const lines: EstimateLineItem[] = [
    line("plot-area", "Plot area", plotArea, "m²", "measured", false, `Plot width x depth (${sqmToSqft(plotArea).toFixed(0)} sq ft).`),
    line("built-up-area", "Built-up room area (all floors)", builtUp, "m²", "measured", false, `Sum of modelled room areas (${sqmToSqft(builtUp).toFixed(0)} sq ft). Wall thickness is not added.`),
    line("wall-length", "Total wall length", wallRunLength, "m", "measured", false, "Sum of wall centre-line lengths on all floors."),
    line("flooring", "Flooring", builtUp, "m²", "calculated", true, "Equals total room area; no wastage allowance included."),
    line("wall-gross", "Gross wall area (one face)", grossWall, "m²", "calculated", false, "Wall length x floor height, summed over all walls."),
    line("openings", "Door and window openings", openingArea, "m²", "calculated", false, "Sum of opening width x height, deducted from wall areas."),
    line("wall-net", "Net wall area (one face)", netWall, "m²", "calculated", false, "Gross wall area minus openings."),
    line("masonry", "Masonry volume", masonry, "m³", "calculated", true, "Net wall area x each wall's modelled thickness. Mortar and wastage not included."),
    line("plaster", "Plaster (both faces)", plaster, "m²", "assumption", true, "ASSUMPTION: every wall is plastered on both faces (net wall area x 2)."),
    line("paint", "Paintable area", paintable, "m²", "assumption", true, `ASSUMPTION: plaster area less ${p.settings.estimate.paintExtraDeductionPct}% extra deduction. Coats are not multiplied.`),
    line("doors", "Doors", doors, "nos", "measured", true, "Count of modelled doors."),
    line("windows", "Windows", windows, "nos", "measured", true, "Count of modelled windows."),
  ];

  if (p.settings.estimate.includeSlabConcrete && p.settings.estimate.slabThickness > 0) {
    const t = p.settings.estimate.slabThickness;
    lines.push(
      line(
        "slab-concrete",
        "Slab concrete (assumed)",
        builtUp * t,
        "m³",
        "assumption",
        true,
        `ASSUMPTION: room area x ${t} m assumed slab thickness, one slab per floor. NOT a structural design and excludes beams, reinforcement and shuttering.`,
      ),
    );
  } else {
    unavailable.push("Slab concrete (switched off in assumptions)");
  }

  const rated = lines.filter((l) => l.amount != null);
  const totalCost = rated.reduce((s, l) => s + (l.amount ?? 0), 0);
  const unrated = lines.filter((l) => l.costable && l.rate == null && l.quantity > 0).map((l) => l.name);

  return {
    lines,
    floors,
    totalCost: Math.round(totalCost * 100) / 100,
    unrated,
    unavailable,
    budgetRemaining: p.targetBudget != null ? Math.round((p.targetBudget - totalCost) * 100) / 100 : null,
  };
}
