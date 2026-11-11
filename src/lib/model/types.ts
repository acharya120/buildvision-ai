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
  | "farmhouse"
  | "shop"
  | "office"
  | "restaurant"
  | "hotel"
  | "school"
  | "hospital"
  | "warehouse"
  | "factory"
  | "mall"
  | "mixed-use"
  | "community-hall"
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
  | "office"
  | "reception"
  | "meeting-room"
  | "classroom"
  | "ward"
  | "shop"
  | "hall"
  | "warehouse"
  | "workshop"
  | "laboratory"
  | "corridor"
  | "lift"
  | "parking"
  | "pantry"
  | "custom";

export interface Plot {
  width: number; // m, along x (width of the bounding box when the plot has a shape)
  depth: number; // m, along y
  /**
   * Optional outline for plots that are not rectangles (corners in order, metres, inside the 0..width x 0..depth box).
   * Absent = the plot is the full width x depth rectangle.
   */
  polygon?: Array<{ x: number; y: number }>;
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

/** Which surroundings are drawn around the building (all optional, all derived from the plan). */
export interface SiteOptions {
  lawn: boolean;
  boundaryWall: boolean;
  entranceGate: boolean;
  exitGate: boolean;
  paths: boolean;
  trees: "none" | "few" | "many";
}

/**
 * Optional drawing details: an indicative structural layout (columns, beams, footings, grid lines),
 * furniture symbols and stair symbols. Sizes are placeholders typed by the user, not engineering design.
 */
export interface DetailOptions {
  grid: boolean;
  columns: boolean;
  beams: boolean;
  footings: boolean;
  furniture: boolean;
  stairs: boolean;
  /** square column side, m */
  columnSize: number;
  /** beam depth below the slab, m */
  beamDepth: number;
  /** square footing side, m */
  footingSize: number;
  /** longest distance allowed between columns along a wall, m */
  maxSpan: number;
  /** depth of the footing underside below ground level, m (used by the structural section sheet) */
  foundationDepth: number;
  /** height of the ground floor level above ground level, m */
  plinthHeight: number;
  /** footing thickness, m */
  footingThickness: number;
  /** roof parapet height, m */
  parapetHeight: number;
  /** optional indicative load distribution (absent = off) */
  loads?: LoadOptions;
}

/**
 * Inputs for the indicative load distribution. All values are placeholders the user can change;
 * they are NOT taken from any design code and the result is not a structural design.
 */
export interface LoadOptions {
  /** write the column load (kN) next to each column on the plan */
  show: boolean;
  /** floor finish + services + partitions, kN/m2 */
  finishDead: number;
  /** slab thickness, m (self weight uses 25 kN/m3) */
  slabThickness: number;
  /** imposed (live) load on floors, kN/m2 */
  liveLoad: number;
  /** imposed load on the top slab/roof, kN/m2 */
  roofLoad: number;
  /** wall unit weight, kN/m3 (brick masonry is often about 19) */
  wallWeight: number;
  /** allowable soil bearing pressure under footings, kN/m2 */
  bearing: number;
}

/** Optional local-rule limits. null = not set. */
export interface PlotLimits {
  /** maximum floor area ratio (total built-up area / plot area) */
  far: number | null;
  /** maximum ground coverage, % of the plot */
  coveragePct: number | null;
  /** maximum building height, m */
  maxHeight: number | null;
}

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
  /** optional surroundings (garden, gates, trees); absent = not shown */
  site?: SiteOptions;
  /** optional structural layout, furniture and stair symbols; absent = not shown */
  detail?: DetailOptions;
  /** degrees clockwise from the top of the plan to true north (0 = north is up). Shown as a north arrow. */
  northAngle?: number;
  /** optional limits from YOUR local rules; the app only compares against them and never changes the design */
  limits?: PlotLimits;
  /** optional material-estimate assumptions (Studio tab); absent = built-in defaults */
  materials?: MaterialsConfig;
}

/** Editable assumptions for the Studio material estimate. Rule-of-thumb values, NOT a structural or contractual specification. */
export interface MaterialsConfig {
  /** wastage on bricks/masonry, % */
  masonryWastePct: number;
  /** wastage on floor and wall tiles, % */
  tileWastePct: number;
  /** wet mortar as a share of masonry volume, % */
  mortarSharePct: number;
  /** plaster thickness, m */
  plasterThickness: number;
  /** concrete in columns, beams and footings per m2 of built-up area (all floors), m3/m2 */
  frameConcretePerM2: number;
  /** reinforcement steel per m3 of concrete, kg/m3 */
  steelKgPerM3: number;
  /** slab thickness used for slab concrete, m */
  slabThickness: number;
  /** paint coats and coverage */
  paintCoats: number;
  paintCoverage: number; // m2 per litre per coat
  /** height of wall tiles in bathrooms/toilets and above kitchen counters, m */
  wetTileHeight: number;
  kitchenTileHeight: number;
  /** percentages added on top of material cost */
  labourPct: number;
  contingencyPct: number;
  taxPct: number;
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
