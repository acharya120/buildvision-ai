import type { Project } from "../model/types";

const KEY = "buildvision.ratePresets.v1";

export interface RatePreset {
  name: string;
  currency: string;
  rates: Record<string, number>;
}

/** Presets hold ONLY numbers the user typed in. Nothing is pre-filled. */
export function loadPresets(): RatePreset[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: RatePreset[] = [];
    for (const d of data) {
      if (!d || typeof d !== "object") continue;
      const { name, currency, rates } = d as Record<string, unknown>;
      if (typeof name !== "string" || !name.trim() || typeof currency !== "string" || !rates || typeof rates !== "object") continue;
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(rates as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[k] = v;
      out.push({ name: name.slice(0, 60), currency: currency.slice(0, 4), rates: clean });
    }
    return out.slice(0, 20);
  } catch {
    return [];
  }
}

export function savePresets(list: RatePreset[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
    return true;
  } catch {
    return false;
  }
}

export const presetFromProject = (name: string, p: Project): RatePreset => ({ name: name.trim().slice(0, 60), currency: p.settings.estimate.currency, rates: { ...p.rates } });
