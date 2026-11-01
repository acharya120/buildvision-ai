import type { UnitSystem } from "./types";

export const M_PER_FT = 0.3048;
export const M_PER_IN = 0.0254;
export const SQFT_PER_SQM = 1 / (M_PER_FT * M_PER_FT);

export type LengthUnit = "m" | "cm" | "mm" | "ft" | "in";

export function toMeters(value: number, unit: LengthUnit): number {
  switch (unit) {
    case "m":
      return value;
    case "cm":
      return value / 100;
    case "mm":
      return value / 1000;
    case "ft":
      return value * M_PER_FT;
    case "in":
      return value * M_PER_IN;
  }
}

export function fromMeters(meters: number, unit: LengthUnit): number {
  switch (unit) {
    case "m":
      return meters;
    case "cm":
      return meters * 100;
    case "mm":
      return meters * 1000;
    case "ft":
      return meters / M_PER_FT;
    case "in":
      return meters / M_PER_IN;
  }
}

export const sqmToSqft = (sqm: number) => sqm * SQFT_PER_SQM;
export const sqftToSqm = (sqft: number) => sqft / SQFT_PER_SQM;

/** The unit used for bare numbers and numeric inputs in a unit system. */
export function primaryUnit(system: UnitSystem): LengthUnit {
  return system === "metric" ? "m" : "ft";
}

const NUM = "(\\d+(?:\\.\\d+)?|\\.\\d+)";
const RE_FT_IN = new RegExp(`^${NUM}\\s*(?:'|ft|feet|foot)\\s*(?:${NUM}\\s*(?:"|in|inch|inches)?)?$`);
const RE_IN = new RegExp(`^${NUM}\\s*(?:"|in|inch|inches)$`);
const RE_METRIC = new RegExp(`^${NUM}\\s*(mm|cm|m|meter|meters|metre|metres)$`);
const RE_BARE = new RegExp(`^${NUM}$`);

/**
 * Parse user text into meters. Accepts: "12", "12.5", "12'6\"", "12 ft 6 in", "3.5m", "350 cm", "40in".
 * A bare number uses the unit system's primary unit (m or ft).
 * Returns null for empty, malformed, negative or non-finite input.
 */
export function parseLength(input: string, system: UnitSystem): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let result: number | null = null;

  if ((m = s.match(RE_FT_IN))) {
    const ft = parseFloat(m[1]);
    const inch = m[2] ? parseFloat(m[2]) : 0;
    result = ft * M_PER_FT + inch * M_PER_IN;
  } else if ((m = s.match(RE_IN))) {
    result = parseFloat(m[1]) * M_PER_IN;
  } else if ((m = s.match(RE_METRIC))) {
    const unit = m[2].startsWith("mm") ? "mm" : m[2] === "cm" ? "cm" : "m";
    result = toMeters(parseFloat(m[1]), unit);
  } else if ((m = s.match(RE_BARE))) {
    result = toMeters(parseFloat(m[1]), primaryUnit(system));
  }
  if (result === null || !Number.isFinite(result) || result < 0) return null;
  return result;
}

/** Human readable length: metric "3.50 m", imperial 11' 6". */
export function formatLength(meters: number, system: UnitSystem): string {
  if (!Number.isFinite(meters)) return "-";
  if (system === "metric") return `${meters.toFixed(2)} m`;
  const sign = meters < 0 ? "-" : "";
  const totalIn = Math.round(Math.abs(meters) / M_PER_IN);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  return `${sign}${ft}' ${inch}"`;
}

/** Numeric text for an input box, in the primary unit (m or decimal ft). */
export function lengthToInput(meters: number, system: UnitSystem): string {
  const v = fromMeters(meters, primaryUnit(system));
  return String(Math.round(v * 1000) / 1000);
}

export function formatArea(sqm: number, system: UnitSystem): string {
  if (!Number.isFinite(sqm)) return "-";
  return system === "metric" ? `${sqm.toFixed(2)} m²` : `${sqmToSqft(sqm).toFixed(1)} sq ft`;
}

export function unitLabel(system: UnitSystem): string {
  return system === "metric" ? "m" : "ft";
}

/** Plot area shown in both systems, e.g. for gaj-sized plots (1 gaj = 1 sq yd = 9 sq ft). */
export function formatPlotArea(sqm: number): string {
  const sqft = sqmToSqft(sqm);
  return `${sqm.toFixed(1)} m² · ${sqft.toFixed(0)} sq ft · ${(sqft / 9).toFixed(1)} gaj`;
}
