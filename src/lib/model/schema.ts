import type {
  BuildingSettings,
  Dimension,
  Floor,
  Opening,
  Project,
  Room,
  Wall,
} from "./types";
import { ROOM_TYPES, BUILDING_TYPE_LABELS, defaultSettings } from "./defaults";

export const CURRENT_SCHEMA_VERSION = 1;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ParseResult = { ok: true; project: Project } | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Hand-written validator (no dependencies) so imports can be fully checked and unit-tested. */
export function parseProject(raw: unknown): ParseResult {
  const errors: string[] = [];
  const err = (m: string) => {
    if (errors.length < 25) errors.push(m);
  };

  let root: unknown = raw;
  if (isRec(raw) && isRec(raw.project) && !("floors" in raw)) root = raw.project;
  if (!isRec(root)) return { ok: false, errors: ["The file does not contain a BuildVision AI project object."] };

  if (root.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    if (isNum(root.schemaVersion) && root.schemaVersion > CURRENT_SCHEMA_VERSION)
      return { ok: false, errors: [`This project was saved by a newer version of BuildVision AI (schema ${root.schemaVersion}).`] };
    err(`Unsupported or missing schemaVersion (expected ${CURRENT_SCHEMA_VERSION}).`);
  }
  const str = (o: Rec, key: string, where: string, max = 120): string => {
    const v = o[key];
    if (!isStr(v) || !v.trim()) {
      err(`${where}: "${key}" must be a non-empty text.`);
      return "";
    }
    return v.trim().slice(0, max);
  };
  const num = (o: Rec, key: string, where: string, min = -1e6, max = 1e6): number => {
    const v = o[key];
    if (!isNum(v)) {
      err(`${where}: "${key}" must be a number.`);
      return 0;
    }
    if (v < min || v > max) err(`${where}: "${key}" (${v}) is outside the allowed range ${min} to ${max}.`);
    return v;
  };

  const id = str(root, "id", "project", 64);
  const name = str(root, "name", "project", 80);
  const createdAt = isStr(root.createdAt) ? root.createdAt : new Date().toISOString();
  const updatedAt = isStr(root.updatedAt) ? root.updatedAt : createdAt;

  const unitSystem = root.unitSystem;
  if (unitSystem !== "metric" && unitSystem !== "imperial") err('project: "unitSystem" must be "metric" or "imperial".');
  const buildingType = root.buildingType;
  if (!isStr(buildingType) || !(buildingType in BUILDING_TYPE_LABELS)) err('project: "buildingType" is not a known type.');

  let plot = { width: 0, depth: 0 };
  if (!isRec(root.plot)) err('project: "plot" is missing.');
  else plot = { width: num(root.plot, "width", "plot", 0.01, 1000), depth: num(root.plot, "depth", "plot", 0.01, 1000) };

  let targetBudget: number | null = null;
  if (root.targetBudget != null) {
    if (isNum(root.targetBudget) && root.targetBudget >= 0) targetBudget = root.targetBudget;
    else err('project: "targetBudget" must be null or a non-negative number.');
  }

  // settings: fill gaps from defaults, validate what is present
  const settings: BuildingSettings = defaultSettings();
  if (isRec(root.settings)) {
    const s = root.settings;
    if (isNum(s.gridStep) && s.gridStep > 0) settings.gridStep = s.gridStep;
    if (typeof s.snap === "boolean") settings.snap = s.snap;
    if (isNum(s.defaultWallThickness) && s.defaultWallThickness > 0) settings.defaultWallThickness = s.defaultWallThickness;
    if (typeof s.allowOverlap === "boolean") settings.allowOverlap = s.allowOverlap;
    if (typeof s.requireAdjoining === "boolean") settings.requireAdjoining = s.requireAdjoining;
    if (isRec(s.estimate)) {
      const e = s.estimate;
      if (isStr(e.currency)) settings.estimate.currency = e.currency.slice(0, 8);
      if (isNum(e.paintExtraDeductionPct)) settings.estimate.paintExtraDeductionPct = Math.min(100, Math.max(0, e.paintExtraDeductionPct));
      if (typeof e.includeSlabConcrete === "boolean") settings.estimate.includeSlabConcrete = e.includeSlabConcrete;
      if (isNum(e.slabThickness) && e.slabThickness > 0) settings.estimate.slabThickness = e.slabThickness;
    }
  }

  const rates: Record<string, number> = {};
  if (root.rates != null) {
    if (!isRec(root.rates)) err('project: "rates" must be an object.');
    else
      for (const [k, v] of Object.entries(root.rates)) {
        if (isNum(v) && v >= 0) rates[k.slice(0, 40)] = v;
        else err(`rates: "${k}" must be a non-negative number.`);
      }
  }

  const floors: Floor[] = [];
  if (!Array.isArray(root.floors) || root.floors.length === 0) err('project: "floors" must be a non-empty list.');
  else if (root.floors.length > 10) err("project: too many floors (maximum 10).");
  else {
    root.floors.forEach((rf, fi) => {
      const where = `floors[${fi}]`;
      if (!isRec(rf)) return err(`${where} is not an object.`);
      const floor: Floor = {
        id: str(rf, "id", where, 64),
        name: str(rf, "name", where, 60),
        height: num(rf, "height", where, 1, 20),
        rooms: [],
        walls: [],
        openings: [],
        dimensions: [],
      };
      const list = (key: string): unknown[] => {
        const v = rf[key];
        if (v == null) return [];
        if (!Array.isArray(v)) {
          err(`${where}: "${key}" must be a list.`);
          return [];
        }
        if (v.length > 2000) {
          err(`${where}: "${key}" has too many entries.`);
          return [];
        }
        return v;
      };
      list("rooms").forEach((r, i) => {
        const w = `${where}.rooms[${i}]`;
        if (!isRec(r)) return err(`${w} is not an object.`);
        const type = r.type;
        if (!isStr(type) || !ROOM_TYPES.includes(type as Room["type"])) err(`${w}: unknown room type.`);
        floor.rooms.push({
          id: str(r, "id", w, 64),
          name: isStr(r.name) ? r.name.slice(0, 60) : "",
          type: (ROOM_TYPES.includes(type as Room["type"]) ? type : "custom") as Room["type"],
          x: num(r, "x", w),
          y: num(r, "y", w),
          width: num(r, "width", w),
          depth: num(r, "depth", w),
        });
      });
      list("walls").forEach((r, i) => {
        const w = `${where}.walls[${i}]`;
        if (!isRec(r)) return err(`${w} is not an object.`);
        const wall: Wall = {
          id: str(r, "id", w, 80),
          x1: num(r, "x1", w),
          y1: num(r, "y1", w),
          x2: num(r, "x2", w),
          y2: num(r, "y2", w),
          thickness: num(r, "thickness", w, 0.01, 2),
          auto: r.auto === true,
        };
        floor.walls.push(wall);
      });
      list("openings").forEach((r, i) => {
        const w = `${where}.openings[${i}]`;
        if (!isRec(r)) return err(`${w} is not an object.`);
        if (r.kind !== "door" && r.kind !== "window") err(`${w}: kind must be "door" or "window".`);
        const o: Opening = {
          id: str(r, "id", w, 64),
          wallId: str(r, "wallId", w, 80),
          kind: r.kind === "window" ? "window" : "door",
          offset: num(r, "offset", w),
          width: num(r, "width", w, 0, 50),
          height: num(r, "height", w, 0, 20),
          sill: num(r, "sill", w, 0, 20),
        };
        floor.openings.push(o);
      });
      list("dimensions").forEach((r, i) => {
        const w = `${where}.dimensions[${i}]`;
        if (!isRec(r)) return err(`${w} is not an object.`);
        const d: Dimension = {
          id: str(r, "id", w, 64),
          x1: num(r, "x1", w),
          y1: num(r, "y1", w),
          x2: num(r, "x2", w),
          y2: num(r, "y2", w),
        };
        floor.dimensions.push(d);
      });
      floors.push(floor);
    });
  }

  // Floor ids must be unique in the project; element ids must be unique within their floor
  // (generated wall ids are derived from coordinates, so two floors may legitimately share one).
  const floorIds = new Set<string>();
  for (const f of floors) {
    if (floorIds.has(f.id)) err(`Duplicate floor id "${f.id}" found.`);
    floorIds.add(f.id);
    const seen = new Set<string>();
    for (const id2 of [...f.rooms.map((r) => r.id), ...f.walls.map((w) => w.id), ...f.openings.map((o) => o.id), ...f.dimensions.map((d) => d.id)]) {
      if (seen.has(id2)) err(`${f.name}: duplicate id "${id2}" found.`);
      seen.add(id2);
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    project: {
      schemaVersion: 1,
      id,
      name,
      createdAt,
      updatedAt,
      unitSystem: unitSystem as Project["unitSystem"],
      buildingType: buildingType as Project["buildingType"],
      plot,
      targetBudget,
      floors,
      settings,
      rates,
    },
  };
}

export function parseProjectJson(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: ["The file is too large to be a BuildVision AI project (limit 5 MB)."] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  return parseProject(data);
}

export function serializeProject(p: Project): string {
  return JSON.stringify({ app: "BuildVision AI", schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), project: p }, null, 2);
}
