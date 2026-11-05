/** Colours used by the 3D view. Every value is a #rrggbb string the user can change. */
export interface Theme3D {
  wall: string;
  roof: string;
  window: string;
  lawn: string;
  boundary: string;
  sky: string;
  ground: string;
  road: string;
  trim: string;
}

export const THEME_FIELDS: Array<[keyof Theme3D, string]> = [
  ["wall", "Walls"],
  ["roof", "Roof"],
  ["window", "Windows"],
  ["lawn", "Lawn"],
  ["boundary", "Boundary wall"],
  ["sky", "Sky"],
  ["road", "Road"],
];

export const THEME_PRESETS: Array<{ key: string; label: string; theme: Theme3D }> = [
  { key: "classic", label: "Red roof", theme: { wall: "#f4f2ec", roof: "#c8402b", window: "#2f7fd6", lawn: "#5fae3f", boundary: "#e3dccd", sky: "#9fd0f5", ground: "#e6e3dc", road: "#3d4147", trim: "#d9d5ca" } },
  { key: "modern", label: "Modern grey", theme: { wall: "#e6e8eb", roof: "#4b5563", window: "#4aa3e0", lawn: "#6bb558", boundary: "#cdd1d6", sky: "#b9d4f0", ground: "#e3e5e8", road: "#363a40", trim: "#c4c8ce" } },
  { key: "warm", label: "Warm sand", theme: { wall: "#f1dfc2", roof: "#8a4b2b", window: "#3f86c4", lawn: "#7db858", boundary: "#e8d3b0", sky: "#f2d9b8", ground: "#ebe2d2", road: "#45413c", trim: "#dcc9a6" } },
  { key: "blue", label: "White and blue", theme: { wall: "#ffffff", roof: "#2f5f9e", window: "#5fb0e8", lawn: "#58a83f", boundary: "#eef1f5", sky: "#a8d4f7", ground: "#e8eaee", road: "#3b4046", trim: "#dfe4ea" } },
  { key: "green", label: "Green roof", theme: { wall: "#f3f1e7", roof: "#3f7d4e", window: "#3b8fd9", lawn: "#69b34a", boundary: "#e6e0cf", sky: "#a6d8ef", ground: "#e4e4dc", road: "#40444a", trim: "#d7d3c4" } },
];

export const DEFAULT_THEME: Theme3D = THEME_PRESETS[0].theme;

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** Accepts anything (for example text read back from storage) and returns a complete, valid theme. */
export function sanitizeTheme(raw: unknown): Theme3D {
  const out: Theme3D = { ...DEFAULT_THEME };
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(out) as Array<keyof Theme3D>) {
      const v = (raw as Record<string, unknown>)[k];
      if (isHexColor(v)) out[k] = v.toLowerCase();
    }
  }
  return out;
}
