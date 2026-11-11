import type { MaterialsConfig, Project } from "../model/types";

export const DEFAULT_MATERIALS: MaterialsConfig = {
  masonryWastePct: 5,
  tileWastePct: 8,
  mortarSharePct: 25,
  plasterThickness: 0.012,
  frameConcretePerM2: 0.04,
  steelKgPerM3: 110,
  slabThickness: 0.125,
  paintCoats: 2,
  paintCoverage: 10,
  wetTileHeight: 2.1,
  kitchenTileHeight: 0.6,
  labourPct: 0,
  contingencyPct: 5,
  taxPct: 0,
};

const RANGES: Record<keyof MaterialsConfig, [number, number]> = {
  masonryWastePct: [0, 50],
  tileWastePct: [0, 50],
  mortarSharePct: [5, 60],
  plasterThickness: [0.005, 0.05],
  frameConcretePerM2: [0, 0.5],
  steelKgPerM3: [0, 400],
  slabThickness: [0.05, 0.6],
  paintCoats: [0, 6],
  paintCoverage: [1, 40],
  wetTileHeight: [0, 4],
  kitchenTileHeight: [0, 4],
  labourPct: [0, 300],
  contingencyPct: [0, 100],
  taxPct: [0, 100],
};

/** Clamp every field to a sane range; anything missing or invalid falls back to the default. */
export function sanitizeMaterials(raw: unknown, base: MaterialsConfig = DEFAULT_MATERIALS): MaterialsConfig | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out = { ...base };
  for (const k of Object.keys(RANGES) as Array<keyof MaterialsConfig>) {
    const v = r[k];
    const [lo, hi] = RANGES[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi) out[k] = v;
  }
  return out;
}

export const materialsOf = (p: Project): MaterialsConfig => p.materials ?? { ...DEFAULT_MATERIALS, slabThickness: p.settings.estimate.slabThickness > 0 ? p.settings.estimate.slabThickness : DEFAULT_MATERIALS.slabThickness };

export function setMaterials(p: Project, patch: Partial<MaterialsConfig>): Project {
  const next = sanitizeMaterials(patch, materialsOf(p)) as MaterialsConfig;
  return { ...p, materials: next, updatedAt: new Date().toISOString() };
}
