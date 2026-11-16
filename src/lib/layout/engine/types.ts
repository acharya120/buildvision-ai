/**
 * Advanced layout engine: shared types. Pure data, no UI. Everything here is OPTIONAL and additive:
 * the existing Auto design generator is untouched and keeps working exactly as before.
 * Results are preliminary concept layouts, not code-compliance approvals.
 */
import type { AutoDesignInput } from "../autodesign";

/** Structural grid: distance between column lines along x and y, metres. */
export interface GridSpec {
  spanX: number;
  spanY: number;
}

export const GRID_PRESETS: ReadonlyArray<{ id: string; label: string; grid: GridSpec }> = [
  { id: "3.0x3.0", label: "3.0 x 3.0 m (compact houses)", grid: { spanX: 3.0, spanY: 3.0 } },
  { id: "3.6x3.6", label: "3.6 x 3.6 m (houses)", grid: { spanX: 3.6, spanY: 3.6 } },
  { id: "4.5x6.0", label: "4.5 x 6.0 m (larger buildings)", grid: { spanX: 4.5, spanY: 6.0 } },
];

/** Limits YOU enter from your local rules. null = not set (no restriction applied). */
export interface ZoningInput {
  setbackFront: number;
  setbackRear: number;
  setbackSide: number;
  /** maximum ground coverage, % of plot area */
  maxCoveragePct: number | null;
  /** floor area ratio (FAR / FSI): total built-up area / plot area */
  maxFar: number | null;
}

export interface EngineInput extends Pick<AutoDesignInput, "floors" | "bedrooms" | "includeDining" | "includeStudy" | "includeGarage" | "includeBalcony" | "includeUtility" | "attachedBathMaster" | "northAngle" | "frontSide"> {
  zoning: ZoningInput;
  grid: GridSpec;
  /** clear width of corridors, metres (1.0 to 1.2 is the usual residential range) */
  corridorWidth: number;
  /** optional: rank layouts by Vastu / directional rules relative to the north arrow (off by default) */
  directional?: boolean;
  /** optional: your own room-relationship weights (see DEFAULT_ADJACENCY); missing pairs use the defaults */
  adjacency?: Record<string, number>;
}

export const DEFAULT_ZONING: ZoningInput = { setbackFront: 0, setbackRear: 0, setbackSide: 0, maxCoveragePct: null, maxFar: null };

export const CORRIDOR_LIMITS = { min: 1.0, max: 2.4, usualMax: 1.2 } as const;

export interface Envelope {
  /** buildable rectangle inside the setbacks, plot coordinates */
  x: number;
  y: number;
  width: number;
  depth: number;
  plotArea: number;
  envelopeArea: number;
  /** largest ground-floor footprint allowed by coverage (and by FAR for the given floor count), m2 */
  maxFootprint: number;
  /** largest total built-up area allowed by FAR, m2 (Infinity when not set) */
  maxBuiltUp: number;
  /** most floors the FAR permits on the smallest useful footprint (informational) */
  errors: string[];
}

export type Severity = "error" | "warning" | "info";
export interface RuleIssue {
  severity: Severity;
  code: string;
  floor: number;
  room?: string;
  message: string;
}
