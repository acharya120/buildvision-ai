import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { wallLength } from "../geometry/walls";
import { sqmToSqft } from "../model/units";
import { materialsOf } from "./config";

export interface MaterialLine {
  /** rate key stored in project.rates (prefixed "mat-") */
  key: string;
  group: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number | null;
  amount: number | null;
  /** how the quantity was obtained */
  basis: "measured" | "calculated" | "assumption";
  note: string;
}
export interface MaterialTakeoff {
  lines: MaterialLine[];
  builtUp: number; // m2, all floors
  footprint: number; // m2
  materialTotal: number;
  labour: number;
  contingency: number;
  tax: number;
  grandTotal: number;
  perSqm: number | null;
  perSqft: number | null;
  unrated: string[];
  notes: string[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const BAG_KG = 50;
const CEMENT_KG_M3 = 1440;
const BRICKS_PER_M3 = 500; // standard 190x90x90 brick with 10 mm joints is about 500 per m3 of masonry

/**
 * Material take-off from the plan plus clearly labelled rule-of-thumb factors. Prices are never
 * pre-filled: cost = quantity x the rate you enter. This is a planning estimate, NOT a bill of quantities.
 */
export function buildTakeoff(p: Project): MaterialTakeoff {
  const c = materialsOf(p);
  const lines: MaterialLine[] = [];
  const rate = (k: string) => (p.rates[k] != null && p.rates[k] >= 0 ? p.rates[k] : null);
  const add = (key: string, group: string, name: string, q: number, unit: string, basis: MaterialLine["basis"], note: string) => {
    const qq = r3(q);
    const rt = rate(key);
    lines.push({ key, group, name, quantity: qq, unit, rate: rt, amount: rt != null ? Math.round(qq * rt * 100) / 100 : null, basis, note });
  };

  let masonry = 0, grossWall = 0, openingArea = 0, tileFloor = 0, tileWall = 0, builtUp = 0;
  const doors = new Map<string, number>();
  const windows = new Map<string, number>();
  for (const f of p.floors) {
    const byId = new Map(f.walls.map((w) => [w.id, w]));
    for (const w of f.walls) {
      const len = wallLength(w);
      const opens = f.openings.filter((o) => o.wallId === w.id).reduce((s, o) => s + o.width * o.height, 0);
      masonry += Math.max(0, len * f.height - opens) * w.thickness;
      grossWall += len * f.height;
    }
    for (const o of f.openings) {
      if (!byId.has(o.wallId)) continue;
      openingArea += o.width * o.height;
      const key = `${o.width.toFixed(2)} x ${o.height.toFixed(2)} m`;
      (o.kind === "door" ? doors : windows).set(key, ((o.kind === "door" ? doors : windows).get(key) ?? 0) + 1);
    }
    for (const r of f.rooms.filter(isValidRect)) {
      const a = r.width * r.depth;
      builtUp += a;
      if (r.type !== "balcony" && r.type !== "staircase" && r.type !== "lift") tileFloor += a;
      const per = 2 * (r.width + r.depth);
      if (r.type === "bathroom" || r.type === "toilet") tileWall += per * c.wetTileHeight;
      else if (r.type === "kitchen") tileWall += per * c.kitchenTileHeight;
    }
  }
  const footprint = Math.max(0, ...p.floors.map((f) => f.rooms.filter(isValidRect).reduce((s, r) => s + r.width * r.depth, 0)));
  const netWall = Math.max(0, grossWall - openingArea);
  const plasterArea = netWall * 2;

  // masonry
  const masonryVol = masonry * (1 + c.masonryWastePct / 100);
  add("mat-bricks", "Masonry", "Bricks", masonry * BRICKS_PER_M3 * (1 + c.masonryWastePct / 100), "nos", "calculated", `${r3(masonry)} m³ of walls x ${BRICKS_PER_M3} bricks per m³ + ${c.masonryWastePct}% wastage.`);
  const mortarWet = masonry * (c.mortarSharePct / 100);
  const mortarDry = mortarWet * 1.27;
  add("mat-cement-mortar", "Masonry", "Cement for brick mortar (1:6)", (mortarDry / 7) * CEMENT_KG_M3 / BAG_KG, "bags", "assumption", `Mortar = ${c.mortarSharePct}% of masonry volume, dry factor 1.27, mix 1:6, ${BAG_KG} kg bags.`);
  add("mat-sand-mortar", "Masonry", "Sand for brick mortar", (mortarDry * 6) / 7, "m³", "assumption", "Same mortar mix as above.");

  // plaster
  const plasterWet = plasterArea * c.plasterThickness;
  const plasterDry = plasterWet * 1.3;
  add("mat-cement-plaster", "Plaster", "Cement for plaster (1:4)", (plasterDry / 5) * CEMENT_KG_M3 / BAG_KG, "bags", "assumption", `${r3(plasterArea)} m² (both faces) x ${c.plasterThickness * 1000} mm, dry factor 1.3, mix 1:4.`);
  add("mat-sand-plaster", "Plaster", "Sand for plaster", (plasterDry * 4) / 5, "m³", "assumption", "Same plaster mix as above.");

  // concrete and steel
  const slabVol = builtUp * c.slabThickness;
  const frameVol = builtUp * c.frameConcretePerM2;
  const conc = slabVol + frameVol;
  add("mat-concrete", "Concrete & steel", "Concrete (M20, slabs + frame)", conc, "m³", "assumption", `Slabs ${r3(slabVol)} m³ (${c.slabThickness} m thick) + columns/beams/footings ${r3(frameVol)} m³ (${c.frameConcretePerM2} m³ per m² built-up). Rule of thumb, not a structural design.`);
  add("mat-cement-concrete", "Concrete & steel", "Cement for concrete (M20 ≈ 8 bags per m³)", conc * 8, "bags", "assumption", "Nominal 1:1.5:3 mix.");
  add("mat-sand-concrete", "Concrete & steel", "Sand for concrete", conc * 0.42, "m³", "assumption", "≈ 0.42 m³ per m³ of M20.");
  add("mat-aggregate", "Concrete & steel", "Coarse aggregate (20 mm)", conc * 0.84, "m³", "assumption", "≈ 0.84 m³ per m³ of M20.");
  add("mat-steel", "Concrete & steel", "Reinforcement steel", conc * c.steelKgPerM3, "kg", "assumption", `${c.steelKgPerM3} kg per m³ of concrete. Actual steel comes from a structural engineer's design.`);

  // finishes
  add("mat-floor-tiles", "Finishes", "Floor tiles", tileFloor * (1 + c.tileWastePct / 100), "m²", "calculated", `Room floor area excluding balconies, stairs and lifts + ${c.tileWastePct}% wastage.`);
  add("mat-wall-tiles", "Finishes", "Wall tiles (bathrooms, toilets, kitchen splash)", tileWall * (1 + c.tileWastePct / 100), "m²", "calculated", `Room perimeter x ${c.wetTileHeight} m in bathrooms/toilets and x ${c.kitchenTileHeight} m in kitchens + wastage. Door openings are not deducted.`);
  add("mat-paint", "Finishes", "Paint", (plasterArea * c.paintCoats) / c.paintCoverage, "litres", "assumption", `${r3(plasterArea)} m² x ${c.paintCoats} coats / ${c.paintCoverage} m² per litre.`);
  add("mat-waterproofing", "Finishes", "Terrace waterproofing", footprint, "m²", "assumption", "Footprint area of the largest floor, assuming a flat roof.");

  // openings
  [...doors].sort().forEach(([k, n]) => add(`mat-door-${k.replace(/[^0-9x]/g, "")}`, "Doors & windows", `Door ${k}`, n, "nos", "measured", "Counted from the plan."));
  [...windows].sort().forEach(([k, n]) => add(`mat-window-${k.replace(/[^0-9x]/g, "")}`, "Doors & windows", `Window ${k}`, n, "nos", "measured", "Counted from the plan."));

  const materialTotal = Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100;
  const labour = Math.round(materialTotal * (c.labourPct / 100) * 100) / 100;
  const contingency = Math.round((materialTotal + labour) * (c.contingencyPct / 100) * 100) / 100;
  const tax = Math.round((materialTotal + labour + contingency) * (c.taxPct / 100) * 100) / 100;
  const grandTotal = Math.round((materialTotal + labour + contingency + tax) * 100) / 100;
  const unrated = lines.filter((l) => l.rate == null && l.quantity > 0).map((l) => l.name);
  const notes = [
    "Not included: excavation and foundation design, electrical, plumbing and sanitary fittings, lifts, woodwork and fixtures, external development, approvals and professional fees.",
    "Quantities marked Assumption use rule-of-thumb factors you can edit. Replace them with your engineer's and contractor's figures for a real tender.",
    `Masonry volume with wastage: ${r3(masonryVol)} m³.`,
  ];
  return { lines, builtUp, footprint, materialTotal, labour, contingency, tax, grandTotal, perSqm: builtUp > 0 && materialTotal > 0 ? grandTotal / builtUp : null, perSqft: builtUp > 0 && materialTotal > 0 ? grandTotal / sqmToSqft(builtUp) : null, unrated, notes };
}

export function takeoffCsv(p: Project): string {
  const t = buildTakeoff(p);
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Group", "Item", "Quantity", "Unit", "Rate", "Amount", "Basis", "Note"].map(q).join(",")];
  for (const l of t.lines) rows.push([l.group, l.name, l.quantity, l.unit, l.rate ?? "", l.amount ?? "", l.basis, l.note].map(q).join(","));
  rows.push("", [`"Material total"`, "", "", "", "", t.materialTotal].join(","), [`"Labour"`, "", "", "", "", t.labour].join(","), [`"Contingency"`, "", "", "", "", t.contingency].join(","), [`"Tax"`, "", "", "", "", t.tax].join(","), [`"Grand total"`, "", "", "", "", t.grandTotal].join(","));
  return rows.join("\n");
}
