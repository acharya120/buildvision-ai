import type {
  BuildingType,
  Dimension,
  Floor,
  Opening,
  OpeningKind,
  Project,
  Room,
  UnitSystem,
  Wall,
} from "./types";
import { DEFAULT_FLOOR_HEIGHT, defaultSettings, floorNameFor } from "./defaults";
import { newId } from "./ids";
import { Rect, TOL, isValidRect, rectRight, rectBottom, rectsOverlap, roundMm } from "../geometry/rect";
import { projectOnWall, regenerateFloorWalls, wallLength } from "../geometry/walls";

/** Smallest room edge the editor allows when resizing by dragging (m). */
export const MIN_ROOM_EDGE = 0.3;

export interface NewProjectInput {
  name: string;
  plotWidth: number; // m
  plotDepth: number; // m
  unitSystem: UnitSystem;
  buildingType: BuildingType;
  floors: number;
  targetBudget?: number | null;
}

export const LIMITS = {
  minPlot: 1.5, // m
  maxPlot: 200, // m
  maxFloors: 6,
  maxNameLength: 80,
};

/** Returns human-readable problems; empty array means the input is acceptable. */
export function validateNewProject(input: NewProjectInput): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push("Enter a project name.");
  if (name.length > LIMITS.maxNameLength) errors.push(`Project name must be at most ${LIMITS.maxNameLength} characters.`);
  const checkDim = (label: string, v: number) => {
    if (!Number.isFinite(v)) errors.push(`${label} must be a number.`);
    else if (v <= 0) errors.push(`${label} must be greater than zero.`);
    else if (v < LIMITS.minPlot) errors.push(`${label} is too small (minimum ${LIMITS.minPlot} m).`);
    else if (v > LIMITS.maxPlot) errors.push(`${label} is unreasonably large (maximum ${LIMITS.maxPlot} m).`);
  };
  checkDim("Plot width", input.plotWidth);
  checkDim("Plot depth", input.plotDepth);
  if (!Number.isInteger(input.floors) || input.floors < 1 || input.floors > LIMITS.maxFloors)
    errors.push(`Number of floors must be a whole number from 1 to ${LIMITS.maxFloors}.`);
  if (input.targetBudget != null && (!Number.isFinite(input.targetBudget) || input.targetBudget < 0))
    errors.push("Target budget must be zero or a positive number.");
  return errors;
}

export function createFloor(index: number, height = DEFAULT_FLOOR_HEIGHT): Floor {
  return {
    id: newId("floor"),
    name: floorNameFor(index),
    height,
    rooms: [],
    walls: [],
    openings: [],
    dimensions: [],
  };
}

export function createProject(input: NewProjectInput): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: newId("proj"),
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
    unitSystem: input.unitSystem,
    buildingType: input.buildingType,
    plot: { width: roundMm(input.plotWidth), depth: roundMm(input.plotDepth) },
    targetBudget: input.targetBudget ?? null,
    floors: Array.from({ length: input.floors }, (_, i) => createFloor(i)),
    settings: defaultSettings(),
    rates: {},
  };
}

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

export function mapFloor(p: Project, floorId: string, fn: (f: Floor) => Floor): Project {
  return touch({ ...p, floors: p.floors.map((f) => (f.id === floorId ? fn(f) : f)) });
}

export const getFloor = (p: Project, floorId: string) => p.floors.find((f) => f.id === floorId);

/* ---------- project-level ---------- */

export const renameProject = (p: Project, name: string): Project => touch({ ...p, name: name.trim() || p.name });

export const setUnitSystem = (p: Project, unitSystem: UnitSystem): Project => touch({ ...p, unitSystem });

export const setBuildingType = (p: Project, buildingType: BuildingType): Project => touch({ ...p, buildingType });

export const setTargetBudget = (p: Project, targetBudget: number | null): Project => touch({ ...p, targetBudget });

/** Changes the plot size. Rooms are NOT moved or clipped; validation reports anything now outside. */
export function setPlot(p: Project, width: number, depth: number): Project {
  if (!(width > 0) || !(depth > 0)) return p;
  return touch({ ...p, plot: { width: roundMm(width), depth: roundMm(depth) } });
}

export const setSettings = (p: Project, patch: Partial<Project["settings"]>): Project =>
  touch({ ...p, settings: { ...p.settings, ...patch } });

export const setEstimateAssumptions = (p: Project, patch: Partial<Project["settings"]["estimate"]>): Project =>
  touch({ ...p, settings: { ...p.settings, estimate: { ...p.settings.estimate, ...patch } } });

export function setRate(p: Project, key: string, rate: number | null): Project {
  const rates = { ...p.rates };
  if (rate == null || !Number.isFinite(rate) || rate < 0) delete rates[key];
  else rates[key] = rate;
  return touch({ ...p, rates });
}

/** Wipes all rooms, walls, openings and dimensions but keeps plot, floors and settings. */
export function resetDesign(p: Project): Project {
  return touch({
    ...p,
    floors: p.floors.map((f) => ({ ...f, rooms: [], walls: [], openings: [], dimensions: [] })),
  });
}

/* ---------- floors ---------- */

export function addFloor(p: Project): { project: Project; floorId: string } | null {
  if (p.floors.length >= LIMITS.maxFloors) return null;
  const floor = createFloor(p.floors.length, p.floors[p.floors.length - 1]?.height ?? DEFAULT_FLOOR_HEIGHT);
  return { project: touch({ ...p, floors: [...p.floors, floor] }), floorId: floor.id };
}

export function removeFloor(p: Project, floorId: string): Project {
  if (p.floors.length <= 1) return p;
  return touch({ ...p, floors: p.floors.filter((f) => f.id !== floorId) });
}

export const renameFloor = (p: Project, floorId: string, name: string): Project =>
  mapFloor(p, floorId, (f) => ({ ...f, name: name.trim() || f.name }));

export const setFloorHeight = (p: Project, floorId: string, height: number): Project =>
  height >= 2 && height <= 6 ? mapFloor(p, floorId, (f) => ({ ...f, height: roundMm(height) })) : p;

/* ---------- rooms ---------- */

/** Search a grid for the first spot where a w x d room fits inside the plot without overlapping. */
export function findFreeSpot(p: Project, floorId: string, w: number, d: number, step = 0.15): { x: number; y: number } | null {
  const floor = getFloor(p, floorId);
  if (!floor) return null;
  const others: Rect[] = floor.rooms.filter(isValidRect);
  for (let y = 0; y + d <= p.plot.depth + TOL; y = roundMm(y + step)) {
    for (let x = 0; x + w <= p.plot.width + TOL; x = roundMm(x + step)) {
      const candidate: Rect = { x, y, width: w, depth: d };
      if (!others.some((o) => rectsOverlap(candidate, o))) return { x, y };
    }
  }
  return null;
}

export const addRoom = (p: Project, floorId: string, room: Room): Project =>
  mapFloor(p, floorId, (f) => ({ ...f, rooms: [...f.rooms, room] }));

export function updateRoom(p: Project, floorId: string, roomId: string, patch: Partial<Omit<Room, "id">>): Project {
  return mapFloor(p, floorId, (f) => ({
    ...f,
    rooms: f.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const next = { ...r, ...patch };
      return {
        ...next,
        x: roundMm(next.x),
        y: roundMm(next.y),
        width: roundMm(next.width),
        depth: roundMm(next.depth),
      };
    }),
  }));
}

export const moveRoom = (p: Project, floorId: string, roomId: string, x: number, y: number): Project =>
  updateRoom(p, floorId, roomId, { x, y });

export const resizeRoom = (p: Project, floorId: string, roomId: string, width: number, depth: number): Project =>
  updateRoom(p, floorId, roomId, { width, depth });

/** Deleting a room leaves walls alone (use "Generate walls" to refresh them). */
export const deleteRoom = (p: Project, floorId: string, roomId: string): Project =>
  mapFloor(p, floorId, (f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== roomId) }));

export const replaceRooms = (p: Project, floorId: string, rooms: Room[]): Project =>
  mapFloor(p, floorId, (f) => ({ ...f, rooms }));

/* ---------- walls & openings ---------- */

export function generateWalls(p: Project, floorId: string): Project {
  return mapFloor(p, floorId, (f) => regenerateFloorWalls(f, p.settings.defaultWallThickness));
}

export function addWall(p: Project, floorId: string, x1: number, y1: number, x2: number, y2: number): { project: Project; id: string } {
  const wall: Wall = {
    id: newId("wall"),
    x1: roundMm(x1),
    y1: roundMm(y1),
    x2: roundMm(x2),
    y2: roundMm(y2),
    thickness: p.settings.defaultWallThickness,
    auto: false,
  };
  return { project: mapFloor(p, floorId, (f) => ({ ...f, walls: [...f.walls, wall] })), id: wall.id };
}

export const updateWall = (p: Project, floorId: string, wallId: string, patch: Partial<Omit<Wall, "id">>): Project =>
  mapFloor(p, floorId, (f) => ({ ...f, walls: f.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)) }));

/** Deleting a wall also deletes the openings that sat on it. */
export const deleteWall = (p: Project, floorId: string, wallId: string): Project =>
  mapFloor(p, floorId, (f) => ({
    ...f,
    walls: f.walls.filter((w) => w.id !== wallId),
    openings: f.openings.filter((o) => o.wallId !== wallId),
  }));

export const OPENING_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
};

/**
 * Place an opening on the wall nearest to (x, y), if one is within `maxDist` metres.
 * The opening is centred on the click and clamped to the wall; returns null when it cannot fit.
 */
export function addOpeningNear(
  p: Project,
  floorId: string,
  kind: OpeningKind,
  x: number,
  y: number,
  maxDist = 0.35,
): { project: Project; id: string } | { error: string } {
  const floor = getFloor(p, floorId);
  if (!floor) return { error: "Floor not found." };
  let best: { wall: Wall; t: number; dist: number } | null = null;
  for (const w of floor.walls) {
    const pr = projectOnWall(w, { x, y });
    if (pr.t < -maxDist || pr.t > wallLength(w) + maxDist) continue;
    if (pr.dist <= maxDist && (!best || pr.dist < best.dist)) best = { wall: w, t: pr.t, dist: pr.dist };
  }
  if (!best) return { error: "Click closer to a wall. Use 'Generate walls' or the wall tool first if the room has no walls." };
  const def = OPENING_DEFAULTS[kind];
  const len = wallLength(best.wall);
  if (def.width > len + TOL) return { error: "That wall is shorter than the opening." };
  const offset = roundMm(Math.min(Math.max(0, best.t - def.width / 2), len - def.width));
  const opening: Opening = {
    id: newId(kind === "door" ? "door" : "win"),
    wallId: best.wall.id,
    kind,
    offset,
    width: def.width,
    height: Math.min(def.height, floor.height),
    sill: def.sill,
  };
  return { project: mapFloor(p, floorId, (f) => ({ ...f, openings: [...f.openings, opening] })), id: opening.id };
}

export const updateOpening = (p: Project, floorId: string, openingId: string, patch: Partial<Omit<Opening, "id">>): Project =>
  mapFloor(p, floorId, (f) => ({
    ...f,
    openings: f.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)),
  }));

export const deleteOpening = (p: Project, floorId: string, openingId: string): Project =>
  mapFloor(p, floorId, (f) => ({ ...f, openings: f.openings.filter((o) => o.id !== openingId) }));

/* ---------- dimensions ---------- */

export function addDimension(p: Project, floorId: string, x1: number, y1: number, x2: number, y2: number): { project: Project; id: string } {
  const dim: Dimension = { id: newId("dim"), x1: roundMm(x1), y1: roundMm(y1), x2: roundMm(x2), y2: roundMm(y2) };
  return { project: mapFloor(p, floorId, (f) => ({ ...f, dimensions: [...f.dimensions, dim] })), id: dim.id };
}

export const deleteDimension = (p: Project, floorId: string, dimId: string): Project =>
  mapFloor(p, floorId, (f) => ({ ...f, dimensions: f.dimensions.filter((d) => d.id !== dimId) }));

/* ---------- selectors ---------- */

export function totalRoomArea(floor: Floor): number {
  return floor.rooms.filter(isValidRect).reduce((s, r) => s + r.width * r.depth, 0);
}

export function roomBounds(r: Room) {
  return { x1: r.x, y1: r.y, x2: rectRight(r), y2: rectBottom(r) };
}
