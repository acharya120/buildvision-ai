/**
 * Grid-based layout solver (Phase 1). Pure geometry and rules: no UI, no canvas, no browser APIs.
 *
 * Layout model (local frame: rear edge at y = 0, front edge at y = D):
 *   rear band | corridor strip (optional) | front band
 * x runs in whole structural bays (nx * spanX). Room walls fall on column lines; only wet-group partitions inside a bay
 * are non-structural. Stair (front) and wet core (rear) stay in bay 0 on every floor, so stairs and plumbing stack.
 * Everything is checked before it is offered: zoning, circulation and shape rules, door reachability.
 * Preliminary concept layouts only: not a structural design, not a code-compliance approval.
 */
import type { Plot, Room, RoomType } from "../../model/types";
import { roundMm, rectArea } from "../../geometry/rect";
import { largestInscribedRect } from "../../geometry/polygon";
import {
  buildPrograms, DEFAULT_AUTODESIGN_INPUT, mk, planOpenings, snap, sum,
  type AutoDesignInput, type DesignOption, type FloorProgram, type OpeningSpec, type PlannedFloor,
} from "../autodesign";
import { shiftOption } from "../autodesignFit";
import { checkZoning, computeEnvelope } from "./envelope";
import { columnLines, gridAlignment, validateGrid } from "./grid";
import { checkCirculation, SHAPE_RULES } from "./circulation";
import { analyseWetWalls, isWet } from "./wetwall";
import { CORRIDOR_LIMITS, DEFAULT_ZONING, GRID_PRESETS, type EngineInput, type Envelope, type RuleIssue } from "./types";

export interface EngineResult {
  options: DesignOption[];
  errors: string[];
  adjustments: string[];
  envelope?: Envelope;
}

export const DEFAULT_ENGINE_INPUT: EngineInput = {
  floors: 1, bedrooms: 2, includeDining: true, includeStudy: false, includeGarage: false, includeBalcony: false,
  includeUtility: false, attachedBathMaster: false, northAngle: 0, frontSide: "bottom",
  zoning: { ...DEFAULT_ZONING }, grid: GRID_PRESETS[0].grid, corridorWidth: CORRIDOR_LIMITS.usualMax,
};

type Item = FloorProgram["front"][number];
interface Sub { type: RoomType; name: string; target: number }
interface Cell { type: RoomType; name: string; target: number; fixed?: boolean; minDepth?: number; subs?: Sub[] }
interface FloorCells { front: Cell[]; rear: Cell[]; needsCorridor: boolean }

const TARGET_AREA: Partial<Record<RoomType, number>> = { living: 15, dining: 10, kitchen: 9, bedroom: 11, "master-bedroom": 14, study: 7, garage: 15, bathroom: 4.4, toilet: 2.2, utility: 4, store: 4 };
const tgt = (t: RoomType) => TARGET_AREA[t] ?? 8;

const shapeOk = (t: RoomType, w: number, d: number): boolean => {
  const r = SHAPE_RULES[t];
  if (!r) return true;
  const s = Math.min(w, d), l = Math.max(w, d);
  return s >= r.minShort - 1e-6 && l / s <= r.maxRatio + 1e-6;
};

/** Split a bay (w x d) among wet sub-rooms in one row, or two rows when one row gives bad shapes. */
function subdivide(subs: Sub[], x: number, y: number, w: number, d: number): Room[] | null {
  const row = (list: Sub[], ry: number, rd: number): Room[] | null => {
    const tot = sum(list.map((s) => s.target));
    const out: Room[] = [];
    let cx = 0;
    for (let i = 0; i < list.length; i++) {
      const wi = i === list.length - 1 ? roundMm(w - cx) : snap((w * list[i].target) / tot);
      if (wi <= 0 || !shapeOk(list[i].type, wi, rd)) return null;
      out.push(mk(list[i].type, list[i].name, x + cx, ry, wi, rd));
      cx += wi;
    }
    return out;
  };
  const one = row(subs, y, d);
  if (one) return one;
  if (subs.length >= 2 && d >= 2.4) {
    const k = Math.ceil(subs.length / 2);
    const d1 = snap(d / 2);
    const a = row(subs.slice(0, k), y, d1), b = row(subs.slice(k), y + d1, roundMm(d - d1));
    if (a && b) return [...a, ...b];
  }
  return null;
}

function floorCells(i: number, p: FloorProgram, input: EngineInput, programs0: FloorProgram[]): FloorCells {
  const multi = input.floors > 1;
  const all: Item[] = [...p.front, ...p.rear];
  const bathItems = all.filter((x) => x.type === "bathroom");
  const attached = bathItems.some((x) => x.name === "Attached Bath");
  const rest = all.filter((x) => !["bathroom", "kitchen", "utility", "living", "garage", "dining"].includes(x.type));
  const living = all.find((x) => x.type === "living");
  const garage = all.find((x) => x.type === "garage");
  const kitchen = all.find((x) => x.type === "kitchen");
  const dining = all.find((x) => x.type === "dining");
  const habitable = rest.filter((x) => ["bedroom", "master-bedroom", "study"].includes(x.type)).length;

  const toCell = (x: Item): Cell => ({ type: x.type, name: x.name, target: x.target, minDepth: x.minDepth });
  const front: Cell[] = [];
  const rear: Cell[] = [];

  // wet core (rear, bay 0 on every floor)
  const nb = multi ? Math.max(1, Math.ceil(p.bedrooms / 2)) : Math.max(1, bathItems.length);
  // the same wet shapes on every floor so bathrooms stack above the ground-floor wet rooms
  const upperNb = multi ? Math.max(1, ...programs0.slice(1).map((q) => Math.ceil(q.bedrooms / 2))) : nb;
  let coreSubs: Sub[];
  if (i === 0 && multi && input.includeUtility) coreSubs = [{ type: "toilet", name: "Guest Toilet", target: 2.2 }, { type: "utility", name: "Utility", target: 4 }];
  else if (attached && !multi) coreSubs = [{ type: "bathroom", name: "Attached Bath", target: 4.4 }, { type: "bathroom", name: "Bathroom", target: 4.4 }];
  else if ((i === 0 && multi ? upperNb : nb) >= 2) coreSubs = [{ type: "bathroom", name: i === 0 && multi ? "Guest Bath" : "Bathroom 1", target: 4.4 }, { type: "bathroom", name: i === 0 && multi ? "Guest Bath 2" : "Bathroom 2", target: 4.4 }];
  else coreSubs = [{ type: "bathroom", name: i === 0 && multi ? "Guest Bath" : "Bathroom", target: 4.4 }, { type: "toilet", name: i === 0 && multi ? "Guest Toilet" : "Toilet", target: 2.2 }];
  rear.push({ type: coreSubs[0].type, name: "Wet core", target: sum(coreSubs.map((s) => s.target)), fixed: true, subs: coreSubs });
  if (multi) front.push({ type: "staircase", name: "Staircase", target: 8, fixed: true });

  // entrance floor
  if (i === 0) {
    if (living) front.push(toCell(living));
    if (garage) front.push(toCell(garage));
    if (kitchen) rear.push(toCell(kitchen));
    if (dining) (kitchen ? rear : front).push(toCell(dining));
  }
  const master = rest.find((x) => x.type === "master-bedroom");
  const others = rest.filter((x) => x !== master);
  if (attached && master && !multi) rear.push(toCell(master));
  const pool = [...(master && !(attached && !multi) ? [master] : []), ...others].sort((a, b) => b.target - a.target);
  const bandSum = (l: Cell[]) => sum(l.filter((c) => !c.fixed).map((c) => c.target));
  for (const it of pool) (bandSum(front) <= bandSum(rear) ? front : rear).push(toCell(it));
  if (i === 0 && !multi && !kitchen) { /* programme always has a kitchen on the ground floor */ }
  const needsCorridor = (multi && i > 0 && habitable >= 2) || habitable >= 3 || (!multi && p.bedrooms >= 2);
  return { front, rear, needsCorridor };
}

/** Bays per cell so that the band fills exactly nx bays; null when it cannot. */
function fillBand(cells: Cell[], nx: number, sx: number, depth: number, cap: number): number[] | null {
  const bays = cells.map((c) => (c.fixed ? 1 : Math.min(3, Math.max(1, Math.round(c.target / (depth * sx))))));
  let total = sum(bays);
  while (total > nx) {
    let k = -1;
    for (let i = 0; i < cells.length; i++) if (!cells[i].fixed && bays[i] > 1 && (k < 0 || bays[i] > bays[k])) k = i;
    if (k < 0) return null;
    bays[k]--; total--;
  }
  while (total < nx) {
    let k = -1, best = -Infinity;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.fixed || bays[i] >= 3) continue;
      const nw = (bays[i] + 1) * sx;
      if (nw * depth > cap * c.target || !shapeOk(c.type, nw, depth)) continue;
      const deficit = (c.target - bays[i] * sx * depth) / c.target;
      if (deficit > best) { best = deficit; k = i; }
    }
    if (k < 0) return null;
    bays[k]++; total++;
  }
  return bays;
}

/** Like fillBand, but when the rooms cannot absorb the extra bays it adds up to two filler rooms (a lounge upstairs, a guest room downstairs). */
function fillBandPlus(cells: Cell[], nx: number, sx: number, depth: number, cap: number, floorIdx: number): { cells: Cell[]; bays: number[] } | null {
  const direct = fillBand(cells, nx, sx, depth, cap);
  if (direct) return { cells, bays: direct };
  for (let k = 1; k <= 2; k++) {
    const extra: Cell[] = Array.from({ length: k }, (_, j) => (floorIdx > 0 ? { type: "living" as RoomType, name: k > 1 ? `Family Lounge ${j + 1}` : "Family Lounge", target: 12 } : { type: "study" as RoomType, name: k > 1 ? `Guest Room ${j + 1}` : "Guest Room", target: 10 }));
    const list = [...cells, ...extra];
    const b = fillBand(list, nx, sx, depth, cap);
    if (b) return { cells: list, bays: b };
  }
  return null;
}

interface Geo { hasStair: boolean; W: number; D: number; Dr: number; C: number; Df: number; sx: number; nx: number }

function placeFloor(fc: FloorCells, g: Geo, bandBays: { front: number[]; rear: number[] }, reasons: Set<string>): Room[] | null {
  const rooms: Room[] = [];
  const band = (cells: Cell[], bays: number[], y: number, d: number): boolean => {
    let bx = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], w = roundMm(bays[i] * g.sx), x = roundMm(bx * g.sx);
      if (c.minDepth && d < c.minDepth - 1e-6) { reasons.add(`${c.name} needs a band at least ${c.minDepth} m deep (this one is ${d} m).`); return false; }
      if (c.subs) {
        const sub = subdivide(c.subs, x, y, w, d);
        if (!sub) { reasons.add(`The wet core (${c.subs.map((s) => s.name).join(", ")}) cannot be shaped in a ${w} x ${d} m bay.`); return false; }
        rooms.push(...sub);
      } else {
        if (!shapeOk(c.type, w, d)) { reasons.add(`${c.name} would be ${w} x ${d} m, an unsuitable shape.`); return false; }
        rooms.push(mk(c.type, c.name, x, y, w, d));
      }
      bx += bays[i];
    }
    return true;
  };
  if (!band(fc.rear, bandBays.rear, 0, g.Dr)) return null;
  // with a stair the strip is a corridor; on a single floor it is a hall ("lobby" type) so the living room can open onto it
  if (g.C > 0) rooms.push(mk(g.hasStair ? "corridor" : "lobby", "Corridor", 0, g.Dr, g.W, g.C));
  if (!band(fc.front, bandBays.front, g.Dr + g.C, g.Df)) return null;
  return rooms;
}

const mirrorX = (rooms: Room[], W: number): Room[] => rooms.map((r) => ({ ...r, x: roundMm(W - r.x - r.width) }));

interface Candidate { option: DesignOption; issues: RuleIssue[] }

function evaluate(plot: Plot, input: EngineInput, env: Envelope, g: Geo, floorsLocal: Room[][], variantLabel: string): Candidate | string {
  const hasStair = input.floors > 1;
  const specs: OpeningSpec[] = [];
  const notes: string[] = [];
  let penalty = 0;
  for (let i = 0; i < floorsLocal.length; i++) {
    const c = planOpenings(i, floorsLocal[i], g.D, hasStair);
    if (c.unreachable.length) return `${c.unreachable[0]} cannot be reached by a door`;
    specs.push(...c.specs);
    for (const m of c.missingWindows) { penalty += 6; notes.push(`${i === 0 ? "Ground floor" : `Floor ${i + 1}`}: ${m} has no outside wall, so no window.`); }
  }
  const circ = checkCirculation(floorsLocal, specs, { x: 0, y: 0, width: g.W, depth: g.D }, { minCorridor: CORRIDOR_LIMITS.min });
  const errs = circ.issues.filter((i) => i.severity === "error");
  if (errs.length) return errs[0].message;
  penalty += 3 * circ.issues.filter((i) => i.severity === "warning").length;

  // to plot coordinates (same frame as the classic generator: front edge at local y = D)
  const flip = input.frontSide === "top";
  const ox = roundMm(env.x + Math.max(0, snap((env.width - g.W) / 2)));
  const oy = flip ? roundMm(env.y) : roundMm(env.y + env.depth - g.D);
  const floors: PlannedFloor[] = floorsLocal.map((rooms, i) => ({
    name: i === 0 ? "Ground Floor" : "",
    rooms: rooms.map((r) => ({ ...r, x: roundMm(ox + r.x), y: roundMm(flip ? oy + g.D - (r.y + r.depth) : oy + r.y) })),
  }));
  const openings = specs.map((s) => ({ ...s, x: roundMm(ox + s.x), y: roundMm(flip ? oy + g.D - s.y : oy + s.y) }));
  const footprint = { x: ox, y: oy, width: g.W, depth: g.D };
  const builtUp = roundMm(sum(floors.map((f) => sum(f.rooms.map(rectArea)))));
  const zoningIssues = checkZoning(plot, input.zoning, footprint, builtUp, input.frontSide);
  if (zoningIssues.length) return zoningIssues[0];

  // reports
  const xs = columnLines(g.W, g.sx, [0, g.Dr, g.Dr + g.C, g.D].filter((v, k, a) => a.indexOf(v) === k)).xs;
  const ys = [0, g.Dr, g.Dr + g.C, g.D].map(roundMm);
  const align = gridAlignment(floorsLocal.flat(), xs, ys, (r) => isWet(r) && r.type !== "kitchen");
  const wet = analyseWetWalls(floorsLocal);

  // score: heuristics only, used for a rough ranking
  let score = 100 - penalty;
  for (const f of floors) for (const r of f.rooms) {
    const t = TARGET_AREA[r.type];
    if (!t || r.type === "toilet") continue;
    const a = r.width * r.depth;
    if (a < 0.85 * t) score -= ((0.85 * t - a) / t) * 20;
    if (a > 1.8 * t) score -= Math.min(10, (a / t - 1.8) * 4);
  }
  score -= circ.circulationRatio * 30;
  score -= 5 * floors.reduce((n, f) => n + f.rooms.filter((r) => /^(Family Lounge|Guest Room)/.test(r.name)).length, 0);
  score += 8 * wet.groupedRatio + 8 * wet.stackedRatio + 6 * align.ratio;

  if (floors.some((f) => f.rooms.some((r) => { const t = TARGET_AREA[r.type]; return !!t && r.width * r.depth > 2.6 * t && r.type !== "garage"; }))) notes.push("Some rooms are larger than usual because the structural grid is wide for this programme; a smaller grid gives more compact rooms.");
  notes.push(`Structural grid ${g.sx.toFixed(1)} m: ${Math.round(align.ratio * 100)}% of room edges on column lines.`);
  notes.push(`Wet walls: ${wet.sharedWallM.toFixed(1)} m shared between wet rooms, ${Math.round(wet.stackedRatio * 100)}% of upper-floor wet area stacked above wet rooms.`);
  notes.push(`Circulation: ${Math.round(circ.circulationRatio * 100)}% of built-up area (corridor, stair); no dead space.`);
  const cov = (g.W * g.D) / env.plotArea * 100;
  notes.push(`Ground coverage ${cov.toFixed(1)}%, FAR ${(builtUp / env.plotArea).toFixed(2)}, within the limits you entered.`);
  for (const i of circ.issues.filter((x) => x.severity !== "error")) notes.push(`Floor ${i.floor + 1}: ${i.message}`);

  return {
    issues: circ.issues,
    option: {
      id: "", label: "", summary: `${variantLabel}, ${g.W.toFixed(1)} x ${g.D.toFixed(1)} m on a ${g.sx.toFixed(1)} m grid`,
      score: Math.round(score * 10) / 10, floors, openings, footprint, builtUpArea: builtUp, notes,
    },
  };
}

export function validateEngineInput(input: EngineInput): string[] {
  const out: string[] = [];
  if (!Number.isInteger(input.floors) || input.floors < 1 || input.floors > 4) out.push("Floors must be 1 to 4 for the rule-based house engine.");
  if (!Number.isInteger(input.bedrooms) || input.bedrooms < 1 || input.bedrooms > 5) out.push("Bedrooms must be 1 to 5.");
  out.push(...validateGrid(input.grid));
  if (!Number.isFinite(input.corridorWidth) || input.corridorWidth < CORRIDOR_LIMITS.min || input.corridorWidth > CORRIDOR_LIMITS.max) out.push(`Corridor width must be between ${CORRIDOR_LIMITS.min} and ${CORRIDOR_LIMITS.max} m.`);
  return out;
}

export function generateEngineOptions(plot: Plot, input: EngineInput): EngineResult {
  const adjustments: string[] = [];
  const errors = validateEngineInput(input);
  if (errors.length) return { options: [], errors, adjustments };
  const env = computeEnvelope(plot, input.zoning, input.floors, input.frontSide);
  if (env.errors.length) return { options: [], errors: env.errors, adjustments, envelope: env };

  const base: AutoDesignInput = { ...DEFAULT_AUTODESIGN_INPUT, floors: input.floors, bedrooms: input.bedrooms, includeDining: input.includeDining, includeStudy: input.includeStudy, includeGarage: input.includeGarage, includeBalcony: false, includeUtility: input.includeUtility, attachedBathMaster: input.attachedBathMaster, northAngle: input.northAngle, frontSide: input.frontSide };
  const programs = buildPrograms(base);
  if (typeof programs === "string") return { options: [], errors: [programs], adjustments, envelope: env };
  if (input.includeBalcony) adjustments.push("Balconies are not placed by the grid engine yet; add them by hand.");
  const cells = programs.map((p, i) => floorCells(i, p, input, programs));
  const needCorr = cells.some((c) => c.needsCorridor);
  const { spanX: sx, spanY: sy } = input.grid;

  const depthsFor = (): number[] => {
    const out: number[] = [];
    for (let k = 1; k <= 3; k++) { const v = roundMm(k * sy); if (v >= 3.0 - 1e-6 && v <= 6.6 + 1e-6) out.push(v); }
    return out;
  };
  const bandDepths = depthsFor();
  const reasons = new Set<string>();
  if (!bandDepths.length) return { options: [], errors: [`A grid span of ${sy} m in y gives band depths outside 3.0 to 6.6 m. Use a different y span.`], adjustments, envelope: env };

  const nxMin = Math.max(2, ...cells.map((c) => Math.max(c.front.length, c.rear.length)));
  const found: Candidate[] = [];
  const seen = new Set<string>();
  const corridorChoices = needCorr ? [true] : [false, true];
  for (let nx = nxMin; nx <= nxMin + 5; nx++) {
    const W = roundMm(nx * sx);
    if (W > env.width + 1e-6) break;
    for (const hasC of corridorChoices) for (const Dr of bandDepths) for (const Df of bandDepths) {
      const C = hasC ? input.corridorWidth : 0;
      const D = roundMm(Dr + C + Df);
      if (D > env.depth + 1e-6 || W * D > env.maxFootprint + 1e-6) continue;
      const g: Geo = { hasStair: input.floors > 1, W, D, Dr, C, Df, sx, nx };
      for (const cap of [1.8, 2.6, Infinity]) {
        const filled = cells.map((fc, i) => ({ rear: fillBandPlus(fc.rear, nx, sx, Dr, cap, i), front: fillBandPlus(fc.front, nx, sx, Df, cap, i) }));
        if (filled.some((b) => !b.rear || !b.front)) { if (cap === Infinity) reasons.add(`The rooms cannot fill ${nx} bays of ${sx} m evenly.`); continue; }
        for (const mirror of [false, true]) for (const revF of [false, true]) for (const revR of [false, true]) {
          // reverse the non-core cells of a band (the core bay stays at bay 0, so stairs and wet stack still line up)
          const floorsLocal: Room[][] = [];
          let ok = true;
          for (let i = 0; i < cells.length && ok; i++) {
            const reorder = (band: { cells: Cell[]; bays: number[] }, rev: boolean, coreCount: number) => {
              if (!rev) return band;
              const idx = band.cells.map((_, k) => k);
              const order = [...idx.slice(0, coreCount), ...idx.slice(coreCount).reverse()];
              return { cells: order.map((k) => band.cells[k]), bays: order.map((k) => band.bays[k]) };
            };
            const f = reorder(filled[i].front as { cells: Cell[]; bays: number[] }, revF, input.floors > 1 ? 1 : 0);
            const r = reorder(filled[i].rear as { cells: Cell[]; bays: number[] }, revR, 1);
            const rooms = placeFloor({ front: f.cells, rear: r.cells, needsCorridor: cells[i].needsCorridor }, g, { front: f.bays, rear: r.bays }, reasons);
            if (!rooms) { ok = false; break; }
            floorsLocal.push(mirror ? mirrorX(rooms, W) : rooms);
          }
          if (!ok) continue;
          const key = floorsLocal.map((fl) => fl.map((r) => `${r.type}${r.x}${r.y}${r.width}${r.depth}`).join(",")).join("/");
          if (seen.has(key)) continue;
          seen.add(key);
          const label = `${mirror ? "core on the right" : "core on the left"}${hasC ? ", corridor" : ", no corridor"}`;
          const cand = evaluate(plot, input, env, g, floorsLocal, label);
          if (typeof cand === "string") { reasons.add(cand); continue; }
          found.push(cand);
        }
        break; // the tighter cap worked for this geometry; do not also add oversized rooms
      }
    }
  }
  if (!found.length) {
    const why = [...reasons].slice(0, 3).join(" ");
    return { options: [], errors: [`No layout fits ${env.width.toFixed(1)} x ${env.depth.toFixed(1)} m of buildable area (footprint at most ${env.maxFootprint.toFixed(1)} m2) on a ${sx} x ${sy} m grid for ${input.bedrooms} bedroom(s) on ${input.floors} floor(s). ${why} Try a smaller grid, fewer bedrooms, more floors, or relaxed limits.`.trim()], adjustments, envelope: env };
  }
  // compactness: a bigger footprint than the smallest workable one loses points (more land, walls and roof for the same rooms)
  const minFp = Math.min(...found.map((c) => c.option.footprint.width * c.option.footprint.depth));
  for (const c of found) c.option.score = Math.round((c.option.score - 15 * ((c.option.footprint.width * c.option.footprint.depth) / minFp - 1)) * 10) / 10;
  found.sort((a, b) => b.option.score - a.option.score);
  const top: DesignOption[] = [];
  for (const c of found) if (top.length < 3 && !top.some((t) => t.summary === c.option.summary)) top.push(c.option);
  for (const c of found) if (top.length < 3 && !top.includes(c.option)) top.push(c.option);
  top.forEach((o, i) => { o.id = `engine_${i + 1}`; o.label = `Rules ${String.fromCharCode(65 + i)}`; });
  return { options: top, errors: [], adjustments, envelope: env };
}

/** Same as generateEngineOptions, but for plots with a shape: the building goes in the largest inscribed rectangle. */
export function generateEngineWithFit(plot: Plot, input: EngineInput): EngineResult {
  if (!plot.polygon) return generateEngineOptions(plot, input);
  const r = largestInscribedRect(plot.polygon);
  if (!r || r.width < 3.6 || r.depth < 3.6) return { options: [], errors: ["This plot shape is too small or narrow for a grid layout."], adjustments: [] };
  const res = generateEngineOptions({ width: r.width, depth: r.depth }, input);
  const note = `Plot shape: the building was placed in the largest rectangle inside your outline (${r.width.toFixed(1)} x ${r.depth.toFixed(1)} m). Limits are measured from that rectangle; FAR and coverage use that rectangle's area.`;
  return { ...res, options: res.options.map((o) => ({ ...shiftOption(o, r.x, r.y), notes: [...o.notes, note] })) };
}
