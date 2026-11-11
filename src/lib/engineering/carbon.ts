import type { Project } from "../model/types";
import { buildTakeoff } from "../materials/takeoff";

export interface CarbonFactor { label: string; unit: string; kg: number }
/**
 * Indicative embodied-carbon factors (kg CO2e per unit). Generic orders of magnitude from published inventories such as
 * ICE; real values vary by country, plant and product. Replace them with your supplier's EPD figures for a real assessment.
 */
export const DEFAULT_CARBON_FACTORS: Record<string, CarbonFactor> = {
  "mat-bricks": { label: "Bricks", unit: "nos", kg: 0.66 },
  "mat-cement-mortar": { label: "Cement (mortar)", unit: "50 kg bag", kg: 41.5 },
  "mat-sand-mortar": { label: "Sand (mortar)", unit: "m³", kg: 8 },
  "mat-cement-plaster": { label: "Cement (plaster)", unit: "50 kg bag", kg: 41.5 },
  "mat-sand-plaster": { label: "Sand (plaster)", unit: "m³", kg: 8 },
  "mat-cement-concrete": { label: "Cement (concrete)", unit: "50 kg bag", kg: 41.5 },
  "mat-sand-concrete": { label: "Sand (concrete)", unit: "m³", kg: 8 },
  "mat-aggregate": { label: "Coarse aggregate", unit: "m³", kg: 7.5 },
  "mat-steel": { label: "Reinforcement steel", unit: "kg", kg: 1.9 },
  "mat-floor-tiles": { label: "Floor tiles", unit: "m²", kg: 15.6 },
  "mat-wall-tiles": { label: "Wall tiles", unit: "m²", kg: 15.6 },
  "mat-paint": { label: "Paint", unit: "litre", kg: 2.5 },
  "mat-waterproofing": { label: "Waterproofing", unit: "m²", kg: 2 },
  "mat-door": { label: "Doors", unit: "nos", kg: 15 },
  "mat-window": { label: "Windows", unit: "nos", kg: 60 },
};
export interface CarbonInputs {
  factors: Record<string, number>;
  /** what-if: percent cut in cement carbon (e.g. blended cement) and steel carbon (e.g. recycled steel) */
  cementCutPct: number;
  steelCutPct: number;
  /** operational: yearly electricity use (kWh) and the grid's kg CO2e per kWh, both typed by the user */
  annualKwh: number;
  gridKgPerKwh: number;
  years: number;
}
export const DEFAULT_CARBON: CarbonInputs = { factors: {}, cementCutPct: 0, steelCutPct: 0, annualKwh: 0, gridKgPerKwh: 0, years: 50 };

export interface CarbonLine { key: string; label: string; quantity: number; unit: string; factor: number; kg: number; sharePct: number }
export interface CarbonResult { lines: CarbonLine[]; embodiedKg: number; perSqm: number; operationalKg: number; lifetimeKg: number; builtUp: number; whatIfSavingKg: number }

const factorKey = (k: string) => (k.startsWith("mat-door-") ? "mat-door" : k.startsWith("mat-window-") ? "mat-window" : k);

export function computeCarbon(p: Project, inp: CarbonInputs): CarbonResult {
  const t = buildTakeoff(p);
  const raw: Array<Omit<CarbonLine, "sharePct">> = [];
  let saving = 0;
  for (const l of t.lines) {
    const fk = factorKey(l.key);
    const def = DEFAULT_CARBON_FACTORS[fk];
    if (!def || l.quantity <= 0) continue;
    const f = inp.factors[fk] != null && inp.factors[fk] >= 0 ? inp.factors[fk] : def.kg;
    const base = l.quantity * f;
    let kg = base;
    if (fk.startsWith("mat-cement")) kg = base * (1 - inp.cementCutPct / 100);
    if (fk === "mat-steel") kg = base * (1 - inp.steelCutPct / 100);
    saving += base - kg;
    const ex = raw.find((r) => r.key === fk);
    if (ex) { ex.quantity += l.quantity; ex.kg += kg; }
    else raw.push({ key: fk, label: def.label, quantity: l.quantity, unit: def.unit, factor: f, kg });
  }
  const total = raw.reduce((s, r) => s + r.kg, 0);
  const lines = raw.map((r) => ({ ...r, sharePct: total > 0 ? (r.kg / total) * 100 : 0 })).sort((a, b) => b.kg - a.kg);
  const op = inp.annualKwh * inp.gridKgPerKwh * inp.years;
  return { lines, embodiedKg: total, perSqm: t.builtUp > 0 ? total / t.builtUp : 0, operationalKg: op, lifetimeKg: total + op, builtUp: t.builtUp, whatIfSavingKg: saving };
}
