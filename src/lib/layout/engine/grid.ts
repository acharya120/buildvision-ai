import type { Room } from "../../model/types";
import { roundMm } from "../../geometry/rect";
import type { GridSpec } from "./types";

/** Usual span limits for an indicative RC frame. These are rules of thumb, not a structural design. */
export const SPAN_LIMITS = { min: 2.4, max: 7.5, economicMax: 6.0 } as const;

export function validateGrid(g: GridSpec): string[] {
  const out: string[] = [];
  for (const [k, v] of [["x", g.spanX], ["y", g.spanY]] as const) {
    if (!Number.isFinite(v)) out.push(`Grid span ${k} must be a number.`);
    else if (v < SPAN_LIMITS.min) out.push(`Grid span ${k} of ${v} m is too small (minimum ${SPAN_LIMITS.min} m).`);
    else if (v > SPAN_LIMITS.max) out.push(`Grid span ${k} of ${v} m is above ${SPAN_LIMITS.max} m, which normally needs a special structural design.`);
  }
  return out;
}

/** Snap a length to the nearest multiple of the span (at least one span). */
export const snapToSpan = (v: number, span: number): number => roundMm(Math.max(1, Math.round(v / span)) * span);
/** Largest multiple of the span that fits in `v` (0 when none). */
export const floorToSpan = (v: number, span: number): number => roundMm(Math.floor(v / span + 1e-9) * span);

/** Column lines for a rectangular footprint: positions along x and y (local coordinates from 0). yLines may be irregular (corridor bay). */
export function columnLines(width: number, xSpan: number, yLines: number[]): { xs: number[]; ys: number[] } {
  const n = Math.round(width / xSpan);
  return { xs: Array.from({ length: n + 1 }, (_, i) => roundMm(i * xSpan)), ys: [...yLines] };
}

/** Column positions (every crossing of the grid lines). */
export function columnPoints(xs: number[], ys: number[]): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (const y of ys) for (const x of xs) pts.push({ x, y });
  return pts;
}

const near = (v: number, lines: number[], tol = 0.011) => lines.some((l) => Math.abs(l - v) <= tol);

/**
 * How well the plan sits on the grid: share of room edges that lie on a column line.
 * Edges inside a wet group (a bay subdivided into bathrooms) are non-structural partitions and are ignored when `wetPartitions` are listed.
 */
export function gridAlignment(rooms: Room[], xs: number[], ys: number[], ignore: (r: Room) => boolean = () => false): { onGrid: number; total: number; ratio: number } {
  let on = 0, tot = 0;
  for (const r of rooms) {
    if (ignore(r)) continue;
    for (const x of [r.x, r.x + r.width]) { tot++; if (near(x, xs)) on++; }
    for (const y of [r.y, r.y + r.depth]) { tot++; if (near(y, ys)) on++; }
  }
  return { onGrid: on, total: tot, ratio: tot ? on / tot : 1 };
}
