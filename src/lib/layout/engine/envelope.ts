import type { Plot } from "../../model/types";
import { roundMm } from "../../geometry/rect";
import { polygonArea } from "../../geometry/polygon";
import type { Envelope, ZoningInput } from "./types";

/**
 * The legal buildable envelope: the plot minus setbacks, further limited by maximum ground coverage and FAR.
 * Front edge of the plot is the bottom edge of the plan unless frontSide is "top". All values are the ones YOU enter;
 * nothing is assumed. This only compares against your numbers and is not an approval.
 */
export function computeEnvelope(plot: Plot, z: ZoningInput, floors: number, frontSide: "bottom" | "top" = "bottom"): Envelope {
  const errors: string[] = [];
  const num = (v: number, name: string) => {
    if (!Number.isFinite(v) || v < 0) errors.push(`${name} must be zero or more.`);
  };
  num(z.setbackFront, "Front setback");
  num(z.setbackRear, "Rear setback");
  num(z.setbackSide, "Side setback");
  if (z.maxCoveragePct != null && (!Number.isFinite(z.maxCoveragePct) || z.maxCoveragePct <= 0 || z.maxCoveragePct > 100)) errors.push("Maximum ground coverage must be between 0 and 100 %.");
  if (z.maxFar != null && (!Number.isFinite(z.maxFar) || z.maxFar <= 0)) errors.push("FAR must be more than zero.");
  if (!Number.isInteger(floors) || floors < 1) errors.push("Floors must be a whole number, 1 or more.");

  const plotArea = plot.polygon ? polygonArea(plot.polygon) : plot.width * plot.depth;
  const w = roundMm(plot.width - 2 * z.setbackSide);
  const d = roundMm(plot.depth - z.setbackFront - z.setbackRear);
  if (!errors.length && (w <= 0 || d <= 0)) errors.push(`The setbacks leave no buildable area (${Math.max(0, w).toFixed(2)} x ${Math.max(0, d).toFixed(2)} m). Reduce the setbacks or use a larger plot.`);
  const envelopeArea = w > 0 && d > 0 ? roundMm(w * d) : 0;
  const x = z.setbackSide;
  const y = frontSide === "bottom" ? z.setbackRear : z.setbackFront;

  const covCap = z.maxCoveragePct == null ? Infinity : (plotArea * z.maxCoveragePct) / 100;
  const maxBuiltUp = z.maxFar == null ? Infinity : plotArea * z.maxFar;
  const farCap = maxBuiltUp / Math.max(1, floors);
  const maxFootprint = roundMm(Math.max(0, Math.min(envelopeArea, covCap, farCap)));
  if (!errors.length && maxFootprint < 12) {
    const why = covCap <= farCap && covCap <= envelopeArea ? "the maximum ground coverage" : farCap <= envelopeArea ? `the FAR with ${floors} floor(s)` : "the setbacks";
    errors.push(`${why[0].toUpperCase()}${why.slice(1)} allows a footprint of only ${maxFootprint.toFixed(1)} m2, too small for any layout. Relax the limit or use fewer floors.`);
  }
  return { x, y: roundMm(y), width: Math.max(0, w), depth: Math.max(0, d), plotArea: roundMm(plotArea), envelopeArea, maxFootprint, maxBuiltUp: Number.isFinite(maxBuiltUp) ? roundMm(maxBuiltUp) : Infinity, errors };
}

/** Most floors the FAR allows if the footprint were `footprint` m2 (null when FAR is not set). */
export function maxFloorsByFar(plotArea: number, far: number | null, footprint: number): number | null {
  if (far == null || footprint <= 0) return null;
  return Math.max(0, Math.floor((plotArea * far) / footprint + 1e-9));
}

/** Compare a finished design with the limits; returns plain-language lines (empty when it complies). */
export function checkZoning(
  plot: Plot,
  z: ZoningInput,
  footprint: { x: number; y: number; width: number; depth: number },
  builtUp: number,
  frontSide: "bottom" | "top" = "bottom",
): string[] {
  const out: string[] = [];
  const plotArea = plot.polygon ? polygonArea(plot.polygon) : plot.width * plot.depth;
  const e = 1e-6;
  const left = footprint.x, right = plot.width - (footprint.x + footprint.width);
  const top = footprint.y, bottom = plot.depth - (footprint.y + footprint.depth);
  const front = frontSide === "bottom" ? bottom : top, rear = frontSide === "bottom" ? top : bottom;
  if (front < z.setbackFront - e) out.push(`Front setback breached: ${front.toFixed(2)} m < ${z.setbackFront} m.`);
  if (rear < z.setbackRear - e) out.push(`Rear setback breached: ${rear.toFixed(2)} m < ${z.setbackRear} m.`);
  if (left < z.setbackSide - e || right < z.setbackSide - e) out.push(`Side setback breached: ${Math.min(left, right).toFixed(2)} m < ${z.setbackSide} m.`);
  const cov = (footprint.width * footprint.depth) / plotArea * 100;
  if (z.maxCoveragePct != null && cov > z.maxCoveragePct + 1e-6) out.push(`Ground coverage ${cov.toFixed(1)} % exceeds ${z.maxCoveragePct} %.`);
  const far = builtUp / plotArea;
  if (z.maxFar != null && far > z.maxFar + 1e-6) out.push(`FAR ${far.toFixed(2)} exceeds ${z.maxFar}.`);
  return out;
}
