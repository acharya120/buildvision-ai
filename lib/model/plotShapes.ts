import { polygonArea, polygonBBox, isSimplePolygon, type Pt } from "../geometry/polygon";
import type { Plot } from "./types";

/**
 * Plot area in common units and ready-made plot shapes. You can enter ANY area; the shape and the width : depth
 * ratio decide the outline. Local units such as bigha or katha differ from place to place, so for those pick
 * "Other" and type how many square feet one of your unit is.
 */
export interface AreaUnit {
  key: string;
  label: string;
  /** square metres in one unit */
  sqm: number;
}
export const AREA_UNITS: AreaUnit[] = [
  { key: "sqft", label: "Square feet", sqm: 0.09290304 },
  { key: "sqm", label: "Square metres", sqm: 1 },
  { key: "gaj", label: "Gaj / square yard", sqm: 0.83612736 },
  { key: "marla", label: "Marla (272.25 sq ft)", sqm: 25.2928526 },
  { key: "kanal", label: "Kanal (20 marla)", sqm: 505.857052 },
  { key: "cent", label: "Cent (435.6 sq ft)", sqm: 40.4685642 },
  { key: "guntha", label: "Guntha (1089 sq ft)", sqm: 101.1714106 },
  { key: "acre", label: "Acre", sqm: 4046.8564224 },
  { key: "hectare", label: "Hectare", sqm: 10000 },
  { key: "other", label: "Other (I enter sq ft per unit)", sqm: 0.09290304 },
];

export type ShapeKey = "rectangle" | "l-shape" | "t-shape" | "trapezoid" | "triangle" | "right-triangle" | "corner-cut" | "parallelogram" | "custom";
export const SHAPE_LABELS: Record<ShapeKey, string> = {
  rectangle: "Rectangle / square",
  "l-shape": "L-shape",
  "t-shape": "T-shape",
  trapezoid: "Trapezoid (narrow at the top)",
  triangle: "Triangle",
  "right-triangle": "Right-angled triangle",
  "corner-cut": "Corner plot (one corner cut)",
  parallelogram: "Slanted (parallelogram)",
  custom: "Custom: I type the corners",
};

/** outlines in a 1 x 1 box; the plot's width and depth stretch them */
const UNIT_SHAPES: Record<Exclude<ShapeKey, "rectangle" | "custom">, Pt[]> = {
  "l-shape": [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.45 }, { x: 0.5, y: 0.45 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }],
  "t-shape": [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.4 }, { x: 0.65, y: 0.4 }, { x: 0.65, y: 1 }, { x: 0.35, y: 1 }, { x: 0.35, y: 0.4 }, { x: 0, y: 0.4 }],
  trapezoid: [{ x: 0.2, y: 0 }, { x: 0.8, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  triangle: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  "right-triangle": [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  "corner-cut": [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.7 }, { x: 0.7, y: 1 }, { x: 0, y: 1 }],
  parallelogram: [{ x: 0.25, y: 0 }, { x: 1, y: 0 }, { x: 0.75, y: 1 }, { x: 0, y: 1 }],
};

export const toSqm = (area: number, unit: string, otherSqftPerUnit = 1): number => {
  const u = AREA_UNITS.find((x) => x.key === unit) ?? AREA_UNITS[0];
  return area * (unit === "other" ? otherSqftPerUnit * 0.09290304 : u.sqm);
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const MIN_AREA_SQM = 4;
export const MAX_AREA_SQM = 20_000_000; // 2000 ha
export const MAX_SIDE_M = 5000;

/**
 * Builds a plot of exactly the given area. `aspect` is width / depth of the bounding box (1 = square).
 * For a plain rectangle the result has no polygon.
 */
export function plotFromArea(areaSqm: number, shape: Exclude<ShapeKey, "custom">, aspect = 1): { plot: Plot } | { error: string } {
  if (!Number.isFinite(areaSqm) || areaSqm < MIN_AREA_SQM) return { error: `The area must be at least ${MIN_AREA_SQM} square metres (about 43 sq ft).` };
  if (areaSqm > MAX_AREA_SQM) return { error: "That area is larger than this tool can draw (2000 hectares)." };
  const a = Number.isFinite(aspect) && aspect >= 0.2 && aspect <= 5 ? aspect : 1;
  const norm = shape === "rectangle" ? 1 : polygonArea(UNIT_SHAPES[shape]);
  const depth = Math.sqrt(areaSqm / (norm * a));
  const width = a * depth;
  if (width > MAX_SIDE_M || depth > MAX_SIDE_M) return { error: "The sides come out longer than 5 km. Use a ratio closer to 1 or a smaller area." };
  if (shape === "rectangle") return { plot: { width: r3(width), depth: r3(depth) } };
  const polygon = UNIT_SHAPES[shape].map((p) => ({ x: r3(p.x * width), y: r3(p.y * depth) }));
  return { plot: { width: r3(width), depth: r3(depth), polygon } };
}

/** Corners typed as "x, y" lines, in metres. Shifted so the plot starts at 0,0. */
export function plotFromCorners(points: Pt[]): { plot: Plot } | { error: string } {
  if (points.length < 3) return { error: "Enter at least 3 corners." };
  if (points.length > 24) return { error: "Use at most 24 corners." };
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return { error: "Every corner needs two numbers." };
  const bb = polygonBBox(points);
  const poly = points.map((p) => ({ x: r3(p.x - bb.x0), y: r3(p.y - bb.y0) }));
  if (!isSimplePolygon(poly)) return { error: "The corners cross each other or overlap. Enter them in order around the plot edge, without crossing lines." };
  const area = polygonArea(poly);
  if (area < MIN_AREA_SQM) return { error: `The area is too small (minimum ${MIN_AREA_SQM} square metres).` };
  if (area > MAX_AREA_SQM) return { error: "That plot is larger than this tool can draw." };
  if (bb.x1 - bb.x0 > MAX_SIDE_M || bb.y1 - bb.y0 > MAX_SIDE_M) return { error: "The plot is wider than 5 km in one direction." };
  return { plot: { width: r3(bb.x1 - bb.x0), depth: r3(bb.y1 - bb.y0), polygon: poly } };
}

/** area of a plot in square metres (polygon when it has one) */
export const plotArea = (plot: Plot): number => (plot.polygon ? polygonArea(plot.polygon) : plot.width * plot.depth);

/** Parses lines such as "0,0" / "12.5 8" / "10ft, 20ft". toMetres converts one number. */
export function parseCorners(text: string, toMetres: (v: string) => number | null): { points: Pt[] } | { error: string } {
  const points: Pt[] = [];
  const lines = text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  for (const [i, l] of lines.entries()) {
    const parts = l.split(/[,\s]+/).filter(Boolean);
    if (parts.length !== 2) return { error: `Line ${i + 1}: write two numbers like 10, 20 (x then y).` };
    const x = toMetres(parts[0]), y = toMetres(parts[1]);
    if (x == null || y == null) return { error: `Line ${i + 1}: "${l}" is not two valid numbers.` };
    points.push({ x, y });
  }
  return { points };
}
