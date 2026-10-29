/**
 * Canonical building model.
 *
 * COORDINATE SYSTEM (documented, used everywhere):
 *  - Canonical unit: METERS. Every stored length/area is in meters / square meters.
 *  - Plan coordinates: origin (0,0) is the top-left corner of the plot.
 *    +x points right (east in the drawing), +y points DOWN the screen (south in the drawing).
 *  - Rooms are axis-aligned rectangles: (x, y) is the top-left corner, width along x, depth along y.
 *  - Vertical: z is up, measured from the top of each floor's finished level; floors stack by `height`.
 *  - 3D mapping: plan x -> three.js x, plan y -> three.js z, up -> three.js y.
 */

export type UnitSystem = "metric" | "imperial";

export type BuildingType =
  | "single-floor"
  | "duplex"
  | "triplex"
  | "bungalow"
  | "villa"
  | "apartment"
  | "custom";

export type RoomType =
  | "living"
  | "bedroom"
  | "master-bedroom"
  | "kitchen"
  | "dining"
  | "bathroom"
  | "toilet"
  | "utility"
  | "store"
  | "study"
  | "balcony"
  | "lobby"
  | "staircase"
  | "garage"
  | "custom";

export interface Plot {
  width: number; // m, along x
  depth: number; // m, along y
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // m
  /** true when generated from room edges; false when drawn by the user. */
  auto: boolean;
}

export type OpeningKind = "door" | "window";

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** distance from the wall start (x1,y1) to the opening's start edge, m */
  offset: number;
  width: number; // m
  height: number; // m
  /** height of the bottom edge above the floor, m (0 for doors) */
  sill: number;
}
export type Door = Opening & { kind: "door" };
export type Window = Opening & { kind: "window" };

export interface Dimension {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Floor {
  id: string;
  name: string;
  /** floor-to-floor height, m */
  height: number;
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  dimensions: Dimension[];
}

export interface EstimateAssumptions {
  currency: string;
  /** extra deduction applied to paintable area (skirting, tiles, etc.), 0..100 */
  paintExtraDeductionPct: number;
  /** if true, slab concrete volume is estimated from footprint x thickness */
  includeSlabConcrete: boolean;
  /** assumed slab thickness, m (an assumption, NOT a structural design) */
  slabThickness: number;
}

export interface BuildingSettings {
  gridStep: number; // m
  snap: boolean;
  /** interior wall thickness, m (also used for walls you draw) */
  defaultWallThickness: number;
  /** thickness of generated exterior walls, m */
  exteriorWallThickness: number;
  allowOverlap: boolean;
  /** when true, rooms with no adjoining room are reported as warnings */
  requireAdjoining: boolean;
  estimate: EstimateAssumptions;
}

/** Rates are user-entered, per m2 / m3 / nos. Keyed by estimate line key. */
export type MaterialRate = number;

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  unitSystem: UnitSystem;
  buildingType: BuildingType;
  plot: Plot;
  targetBudget: number | null;
  floors: Floor[];
  settings: BuildingSettings;
  rates: Record<string, MaterialRate>;
}
export type BuildingModel = Project;

export type Severity = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  floorId?: string;
  elementId?: string;
}

export type EstimateBasis = "measured" | "calculated" | "assumption";

export interface EstimateLineItem {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  /** user-provided rate per unit, null when not entered */
  rate: number | null;
  /** quantity x rate, null when no rate was provided */
  amount: number | null;
  basis: EstimateBasis;
  /** whether the line can carry a cost */
  costable: boolean;
  note: string;
}

export type Selection =
  | { kind: "room"; id: string }
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "dimension"; id: string };
