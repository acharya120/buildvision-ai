import type { Floor, OpeningKind, Plot, Project, Room, RoomType } from "../model/types";
import { newId } from "../model/ids";
import { createFloor, addOpeningOnWall, generateWalls, addDimension, mapFloor } from "../model/ops";
import { exteriorSegments, sharedSegment, type Seg, type SideSeg } from "../geometry/adjacency";
import { projectOnWall, wallLength } from "../geometry/walls";
import { roundMm, TOL } from "../geometry/rect";

/**
 * Rule-based concept layout generator. It is a deterministic search over a few room arrangements
 * ("banded" layouts with a stacked stair/bath core). It is NOT AI and NOT an architect: it knows
 * nothing about orientation, ventilation rules, structure or local regulations. Every result is a
 * starting concept that you can edit, and it is checked by the same validator as hand-made designs.
 */

export type Sizing = "standard" | "spacious" | "fill";

export interface AutoDesignInput {
  floors: number;
  bedrooms: number;
  includeDining: boolean;
  includeStudy: boolean;
  includeGarage: boolean;
  includeBalcony: boolean;
  includeUtility: boolean;
  /** put a bathroom directly next to the master bedroom */
  attachedBathMaster: boolean;
  /** which plot edge faces the street / main entrance */
  frontSide: "bottom" | "top";
  /** distances from the plot boundary that stay empty, metres. YOU enter these from your local rules; nothing is assumed. */
  setbackFront: number;
  setbackRear: number;
  setbackSide: number;
  /** standard = rooms near usual sizes, spacious = up to ~1.7x, fill = use the whole buildable area */
  sizing: Sizing;
}

export const DEFAULT_AUTODESIGN_INPUT: AutoDesignInput = {
  floors: 1,
  bedrooms: 2,
  includeDining: true,
  includeStudy: false,
  includeGarage: false,
  includeBalcony: true,
  includeUtility: false,
  attachedBathMaster: false,
  frontSide: "bottom",
  setbackFront: 0,
  setbackRear: 0,
  setbackSide: 0,
  sizing: "standard",
};

export const AUTODESIGN_LIMITS = { floors: [1, 4], bedrooms: [1, 5] } as const;
export const COMMERCIAL_LIMITS = { floors: [1, 100] } as const;

export interface OpeningSpec {
  floorIndex: number;
  kind: OpeningKind;
  /** centre of the opening on the wall line, plan metres */
  x: number;
  y: number;
  width: number;
  height: number;
  sill: number;
  /** what it is for, shown in notes */
  purpose: string;
}

export interface PlannedFloor {
  name: string;
  rooms: Room[];
}

export interface DesignOption {
  id: string;
  label: string;
  summary: string;
  score: number;
  floors: PlannedFloor[];
  openings: OpeningSpec[];
  /** when set, every floor gets this floor-to-floor height (m) */
  floorHeight?: number;
  /** building footprint position and size on the plot (metres) */
  footprint: { x: number; y: number; width: number; depth: number };
  builtUpArea: number;
  notes: string[];
}

export interface GenerateResult {
  options: DesignOption[];
  errors: string[];
}

/* ------------------------------------------------------------------ */

const G = 0.05; // layout grid, m
export const snap = (v: number) => roundMm(Math.round(v / G) * G);
export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

interface Item {
  type: RoomType;
  name: string;
  /** target area, m2 */
  target: number;
  /** minimum short edge, m */
  mn: number;
  /** minimum depth required in a band, m */
  minDepth?: number;
  balcony?: boolean;
}

const TARGET: Partial<Record<RoomType, number>> = {
  living: 15,
  dining: 10,
  kitchen: 9,
  bedroom: 11,
  "master-bedroom": 14,
  bathroom: 4.4,
  study: 7,
  garage: 15,
  utility: 4,
  store: 4,
};
const MIN: Partial<Record<RoomType, number>> = {
  living: 3.0,
  dining: 2.4,
  kitchen: 2.1,
  bedroom: 2.7,
  "master-bedroom": 3.0,
  bathroom: 1.5,
  study: 2.1,
  garage: 2.7,
  utility: 1.2,
  store: 1.2,
  toilet: 1.0,
};
const item = (type: RoomType, name: string, extra: Partial<Item> = {}): Item => ({
  type,
  name,
  target: TARGET[type] ?? 8,
  mn: MIN[type] ?? 1.5,
  ...extra,
});

/** Split `total` into parts proportional to `wants`, none smaller than its minimum, on the layout grid. */
export function splitLengths(total: number, wants: number[], mins: number[]): number[] | null {
  const n = wants.length;
  if (n === 0) return [];
  if (sum(mins) > total + 1e-6) return null;
  const lens = new Array<number>(n).fill(0);
  const fixed = new Array<boolean>(n).fill(false);
  for (let iter = 0; iter <= n; iter++) {
    const free = wants.filter((_, i) => !fixed[i]);
    const remaining = total - sum(lens.filter((_, i) => fixed[i]));
    const freeSum = sum(free);
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      lens[i] = (wants[i] * remaining) / freeSum;
      if (lens[i] < mins[i]) {
        lens[i] = mins[i];
        fixed[i] = true;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const out: number[] = [];
  let prev = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += lens[i];
    const edge = i === n - 1 ? total : snap(acc);
    out.push(roundMm(edge - prev));
    prev = edge;
  }
  return out.every((l, i) => l >= mins[i] - 1e-6) ? out : null;
}

/** Lay items left-to-right along a band. */
function fillBand(items: Item[], x0: number, y0: number, width: number, depth: number): Room[] | null {
  if (!items.length) return [];
  const lens = splitLengths(width, items.map((i) => i.target), items.map((i) => i.mn));
  if (!lens) return null;
  const rooms: Room[] = [];
  let x = x0;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const w = lens[k];
    if (it.balcony) {
      const bd = 1.2;
      if (depth - bd < it.mn) return null;
      rooms.push(mk(it.type, it.name, x, y0, w, roundMm(depth - bd)));
      rooms.push(mk("balcony", "Balcony", x, roundMm(y0 + depth - bd), w, bd));
    } else {
      if (depth < (it.minDepth ?? it.mn) - 1e-6) return null;
      rooms.push(mk(it.type, it.name, x, y0, w, depth));
    }
    x = roundMm(x + w);
  }
  return rooms;
}

export const mk = (type: RoomType, name: string, x: number, y: number, width: number, depth: number): Room => ({
  id: newId("room"),
  name,
  type,
  x: roundMm(x),
  y: roundMm(y),
  width: roundMm(width),
  depth: roundMm(depth),
});

/* ---------------- programme ---------------- */

interface FloorProgram {
  front: Item[];
  rear: Item[];
  /** the floor gets a corridor band between the front and rear bands */
  corridor: boolean;
  bedrooms: number;
}

function bedroomPlan(floors: number, bedrooms: number): number[] {
  if (floors === 1) return [bedrooms];
  const ground = bedrooms >= 4 ? 1 : 0;
  const upper = floors - 1;
  const rest = bedrooms - ground;
  const per = Array.from({ length: upper }, (_, i) => Math.floor(rest / upper) + (i < rest % upper ? 1 : 0));
  return [ground, ...per];
}

export function buildPrograms(input: AutoDesignInput): FloorProgram[] | string {
  const n = input.floors;
  const plan = bedroomPlan(n, input.bedrooms);
  if (plan.some((b) => b > 4)) return "That many bedrooms does not fit on this many floors. Add a floor or reduce bedrooms.";
  const masterFloor = n === 1 ? 0 : plan.findIndex((b, i) => i > 0 && b > 0);
  const programs: FloorProgram[] = [];
  let studyPlaced = !input.includeStudy;

  for (let i = 0; i < n; i++) {
    const front: Item[] = [];
    const rear: Item[] = [];
    const beds: Item[] = [];
    let bedNo = 0;
    for (let b = 0; b < plan[i]; b++) {
      const isMaster = i === masterFloor && b === 0 && input.bedrooms >= 2;
      bedNo += isMaster ? 0 : 1;
      beds.push(
        item(isMaster ? "master-bedroom" : "bedroom", isMaster ? "Master Bedroom" : `Bedroom ${bedNo}`, {
          balcony: i > 0 && input.includeBalcony && b === 0,
        }),
      );
    }
    const wet: Item[] = [];
    if (i === 0) {
      front.push(item("living", "Living Room"));
      if (input.includeGarage) front.push(item("garage", "Garage", { minDepth: 5.0 }));
      rear.push(item("kitchen", "Kitchen"));
      if (input.includeDining) rear.push(item("dining", "Dining"));
      if (input.includeUtility) rear.push(item("utility", "Utility"));
    }
    if (!studyPlaced && i === (n === 1 ? 0 : plan.findIndex((b, k) => k > 0 && b >= 0 && k >= 1))) {
      beds.push(item("study", "Study"));
      studyPlaced = true;
    }
    // single storey: bathrooms sit inside the bands because there is no stair core
    if (n === 1) {
      const master = beds.find((b) => b.type === "master-bedroom");
      if (master && input.attachedBathMaster) {
        const idx = beds.indexOf(master);
        beds.splice(idx + 1, 0, item("bathroom", "Attached Bath"));
      }
      wet.push(item("bathroom", "Bathroom"));
    }
    if (n === 1 && plan[0] >= 2) {
      // single storey with several bedrooms: public rooms at the front, private rooms behind a hall
      front.push(...rear.splice(0, rear.length));
      programs.push({ front, rear: [...beds, ...wet], corridor: true, bedrooms: plan[0] });
      continue;
    }
    // greedy balance of the remaining rooms between the two bands
    const bandSum = (l: Item[]) => sum(l.map((x) => x.target));
    for (const it of [...beds, ...wet]) {
      if (it.type === "bathroom" && it.name === "Attached Bath") {
        // keep attached bath next to its bedroom
        const host = [front, rear].find((l) => l.some((x) => x.type === "master-bedroom")) ?? rear;
        const pos = host.findIndex((x) => x.type === "master-bedroom");
        host.splice(pos + 1, 0, it);
        continue;
      }
      (bandSum(front) <= bandSum(rear) ? front : rear).push(it);
    }
    const habitable = front.concat(rear).filter((x) => ["bedroom", "master-bedroom", "study"].includes(x.type)).length;
    programs.push({ front, rear, corridor: i > 0 && habitable >= 3, bedrooms: plan[i] });
  }
  return programs;
}

/* ---------------- geometry of one variant ---------------- */

interface Variant {
  coreLeft: boolean;
  frontFirst: boolean; // reverse order of front band items
  rearFirst: boolean;
}

interface LocalPlan {
  floors: Room[][];
  ok: boolean;
  reason?: string;
}

const CORE_W = 1.8;
const STAIR_D = 3.0;
const CORR_D = 1.2;

export function layoutVariant(W: number, D: number, input: AutoDesignInput, programs: FloorProgram[], v: Variant): LocalPlan {
  const n = input.floors;
  const hasCore = n > 1;
  const cw = hasCore ? CORE_W : 0;
  const bandW = roundMm(W - cw);
  const bandX0 = hasCore && v.coreLeft ? cw : 0;
  const coreX = v.coreLeft ? 0 : roundMm(W - cw);
  const fail = (reason: string): LocalPlan => ({ floors: [], ok: false, reason });
  if (bandW < 3) return fail("Too narrow for the rooms.");

  // band split line dr (rear band depth), chosen to balance area and respect minimum depths
  const rearArea = programs.map((p) => sum(p.rear.map((x) => x.target)));
  const frontArea = programs.map((p) => sum(p.front.map((x) => x.target)));
  const share = sum(rearArea) / Math.max(1, sum(rearArea) + sum(frontArea));
  const minRear = Math.max(...programs.map((p) => Math.max(0, ...p.rear.map((x) => x.minDepth ?? x.mn))));
  const minFront = Math.max(...programs.map((p) => Math.max(0, ...p.front.map((x) => x.minDepth ?? x.mn))));
  const stackExtra = programs.some((p) => [...p.front, ...p.rear].some((x) => x.balcony)) ? 1.2 : 0;

  const candidates: number[] = [];
  const ideal = D * share;
  for (const d of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2]) candidates.push(snap(ideal + d));

  for (const dr of candidates) {
    const rearD = dr;
    if (rearD < minRear - 1e-6) continue;
    const frontD = roundMm(D - dr);
    if (frontD < minFront + stackExtra * 0 - 1e-6) continue;
    if (hasCore && (dr < 3.0 || D - dr < 1.8 + 0.0)) continue;
    const floors: Room[][] = [];
    let bad = false;
    // core geometry (same on every floor)
    const coreRooms: Array<{ role: "bath" | "extra" | "stair" | "rem"; y: number; d: number }> = [];
    if (hasCore) {
      const yS = roundMm(dr - 1.2);
      let ds = STAIR_D;
      let rem = roundMm(D - yS - ds);
      if (rem < 1.5) {
        ds = roundMm(Math.min(3.6, ds + rem));
        rem = roundMm(D - yS - ds);
      }
      if (rem < -TOL || (rem > TOL && rem < 1.0)) continue;
      if (yS < 1.8) continue;
      if (yS > 3.3) {
        coreRooms.push({ role: "extra", y: 0, d: roundMm(yS - 2.4) }, { role: "bath", y: roundMm(yS - 2.4), d: 2.4 });
      } else coreRooms.push({ role: "bath", y: 0, d: yS });
      coreRooms.push({ role: "stair", y: yS, d: ds });
      if (rem > TOL) coreRooms.push({ role: "rem", y: roundMm(yS + ds), d: rem });
    }
    for (let i = 0; i < n; i++) {
      const p = programs[i];
      const rooms: Room[] = [];
      const corr = p.corridor;
      const rearItems = v.rearFirst ? [...p.rear].reverse() : p.rear;
      const frontItems = v.frontFirst ? [...p.front].reverse() : p.front;
      const fy = corr ? roundMm(dr + CORR_D) : dr;
      const fd = roundMm(D - fy);
      const needFront = Math.max(0, ...p.front.map((x) => (x.balcony ? x.mn + 1.2 : x.minDepth ?? x.mn)));
      const needRear = Math.max(0, ...p.rear.map((x) => (x.balcony ? x.mn + 1.2 : x.minDepth ?? x.mn)));
      if ((p.front.length && fd < needFront - 1e-6) || (p.rear.length && rearD < needRear - 1e-6)) {
        bad = true;
        break;
      }
      // an empty band is merged into the other one by stretching it (a band without items is not allowed to leave a hole)
      let rearRooms: Room[] | null;
      let frontRooms: Room[] | null;
      if (!p.rear.length && !p.front.length) { bad = true; break; }
      if (!p.rear.length) {
        // nothing at the rear: front band takes the whole depth (minus corridor)
        frontRooms = fillBand(frontItems, bandX0, corr ? CORR_D : 0, bandW, roundMm(D - (corr ? CORR_D : 0)));
        rearRooms = [];
      } else if (!p.front.length) {
        rearRooms = fillBand(rearItems, bandX0, 0, bandW, corr ? dr : D);
        frontRooms = [];
        if (corr) { bad = true; break; }
      } else {
        rearRooms = fillBand(rearItems, bandX0, 0, bandW, rearD);
        frontRooms = fillBand(frontItems, bandX0, fy, bandW, fd);
      }
      if (!rearRooms || !frontRooms) {
        bad = true;
        break;
      }
      rooms.push(...rearRooms, ...frontRooms);
      if (corr) rooms.push(mk("lobby", "Lobby", bandX0, dr, bandW, CORR_D));
      if (hasCore) {
        for (const c of coreRooms) {
          let type: RoomType;
          let name: string;
          if (c.role === "stair") { type = "staircase"; name = "Staircase"; }
          else if (c.role === "bath") { type = "bathroom"; name = "Bathroom"; }
          else if (i === 0) { const big = c.d * cw > 3.3; type = big ? "store" : "toilet"; name = big ? "Store" : "Toilet"; }
          else { const big = c.d * cw >= 3.6; type = big ? "bathroom" : "toilet"; name = big ? "Bath 2" : "Toilet"; }
          rooms.push(mk(type, name, coreX, c.y, cw, c.d));
        }
      }
      floors.push(rooms);
    }
    if (bad) continue;
      return { floors, ok: true };
  }
  return fail("The rooms do not fit this footprint in this arrangement.");
}

/* ---------------- doors, windows, scoring ---------------- */

const HUBS = new Set<RoomType>(["living", "lobby", "staircase"]);

/** Cost of opening a door from an already-reached room `a` into room `b`; Infinity = not allowed. */
function doorCost(a: RoomType, b: RoomType): number {
  const bed = (t: RoomType) => t === "bedroom" || t === "master-bedroom";
  if (a === "living") {
    if (b === "dining") return 1;
    if (b === "kitchen") return 2;
    if (b === "staircase" || b === "lobby") return 1;
    if (bed(b) || b === "study") return 2;
    if (b === "store" || b === "utility") return 4;
    if (b === "garage" || b === "toilet" || b === "bathroom" || b === "balcony") return 2;
    return Infinity;
  }
  if (a === "lobby" || a === "corridor") return b === "garage" ? Infinity : b === "dining" ? 3 : b === "kitchen" ? 4 : b === "corridor" ? 1 : 1;
  if (a === "reception" || a === "hall") return b === "corridor" || b === "lobby" ? 1 : b === "staircase" || b === "lift" ? 2 : b === "office" || b === "meeting-room" || b === "shop" ? 2 : Infinity;
  if (a === "staircase") {
    if (b === "lobby" || b === "corridor") return 1;
    if (b === "living" || b === "reception" || b === "hall") return 1;
    if (b === "lift") return 2;
    if (bed(b) || b === "study") return 3;
    if (b === "bathroom" || b === "toilet") return 3;
    if (b === "dining" || b === "kitchen") return 4;
    if (b === "store") return 3;
    return Infinity;
  }
  if (a === "dining") return b === "kitchen" ? 1 : b === "living" ? 2 : b === "study" ? 3 : b === "utility" ? 3 : bed(b) ? 4 : Infinity;
  if (a === "kitchen") return b === "utility" || b === "store" ? 1 : b === "dining" ? 1 : Infinity;
  if (bed(a)) return b === "bathroom" || b === "toilet" ? (a === "master-bedroom" ? 0.5 : 1.5) : b === "balcony" ? 1 : Infinity;
  if (a === "garage") return b === "utility" || b === "store" ? 1 : Infinity;
  if (a === "utility") return b === "garage" || b === "store" ? 1 : Infinity;
  return Infinity;
}

interface Occupied {
  orient: "h" | "v";
  fixed: number;
  lo: number;
  hi: number;
}

function place(seg: Seg, width: number, occupied: Occupied[], fractions = [0.5, 0.35, 0.65, 0.22, 0.78]): number | null {
  const len = seg.to - seg.from;
  if (len < width + 0.2 - TOL) return null;
  for (const f of fractions) {
    let c = seg.from + f * len;
    c = Math.min(Math.max(c, seg.from + 0.1 + width / 2), seg.to - 0.1 - width / 2);
    const lo = c - width / 2;
    const hi = c + width / 2;
    const clash = occupied.some((o) => o.orient === seg.orient && Math.abs(o.fixed - seg.fixed) < 0.02 && lo < o.hi + 0.1 && o.lo < hi + 0.1);
    if (!clash) {
      occupied.push({ orient: seg.orient, fixed: seg.fixed, lo, hi });
      return roundMm(c);
    }
  }
  return null;
}

const centre = (seg: Seg, c: number) => (seg.orient === "h" ? { x: c, y: seg.fixed } : { x: seg.fixed, y: c });

interface Connected {
  specs: OpeningSpec[];
  unreachable: string[];
  missingWindows: string[];
}

export function planOpenings(floorIndex: number, rooms: Room[], D: number, hasStair: boolean): Connected {
  const specs: OpeningSpec[] = [];
  const occupied: Occupied[] = [];
  const unreachable: string[] = [];
  const missingWindows: string[] = [];

  // ---- doors between rooms (Prim over allowed pairs) ----
  const root =
    floorIndex === 0 || !hasStair
      ? rooms.find((r) => r.type === "living") ?? rooms.find((r) => r.type === "reception") ?? rooms.find((r) => r.type === "hall") ?? rooms.find((r) => r.type === "lobby") ?? rooms.find((r) => r.type === "corridor")
      : rooms.find((r) => r.type === "staircase");
  const visited = new Set<string>();
  const connected = new Set<string>();
  if (root) visited.add(root.id);
  const doorWidth = (a: RoomType, b: RoomType) => (a === "balcony" || b === "balcony" ? 1.2 : a === "bathroom" || b === "bathroom" || a === "toilet" || b === "toilet" || a === "store" || b === "store" ? 0.75 : 0.9);
  const link = (a: Room, b: Room, purpose: string) => {
    const seg = sharedSegment(a, b);
    if (!seg) return false;
    const w = doorWidth(a.type, b.type);
    const c = place(seg, w, occupied);
    if (c == null) return false;
    const pt = centre(seg, c);
    specs.push({ floorIndex, kind: "door", ...pt, width: w, height: 2.1, sill: 0, purpose });
    connected.add([a.id, b.id].sort().join("|"));
    return true;
  };
  while (root && visited.size < rooms.length) {
    let best: { a: Room; b: Room; cost: number; len: number } | null = null;
    for (const a of rooms) {
      if (!visited.has(a.id)) continue;
      for (const b of rooms) {
        if (visited.has(b.id)) continue;
        const cost = doorCost(a.type, b.type);
        if (!Number.isFinite(cost)) continue;
        const seg = sharedSegment(a, b);
        if (!seg) continue;
        const len = seg.to - seg.from;
        if (len < doorWidth(a.type, b.type) + 0.2 - TOL) continue;
        if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && len > best.len)) best = { a, b, cost, len };
      }
    }
    if (!best) break;
    if (link(best.a, best.b, `${best.a.name} to ${best.b.name}`)) visited.add(best.b.id);
    else {
      // cannot place the door: treat that pair as unusable by marking b visited-failed through a skip list
      visited.add(best.b.id);
      unreachable.push(best.b.name);
    }
  }
  for (const r of rooms) if (!visited.has(r.id)) unreachable.push(r.name);

  // extra openings that make a plan feel connected (open passages)
  const find = (t: RoomType) => rooms.filter((r) => r.type === t);
  for (const d of find("dining")) for (const k of find("kitchen")) if (!connected.has([d.id, k.id].sort().join("|"))) link(d, k, "Dining to Kitchen");
  for (const l of find("living")) for (const d of find("dining")) if (!connected.has([l.id, d.id].sort().join("|"))) link(l, d, "Living to Dining");
  // a balcony reachable from a living room when it touches one
  for (const bl of find("balcony")) if (![...connected].some((c) => c.includes(bl.id))) for (const l of find("living")) link(l, bl, "Living to Balcony");

  // ---- main entrance and garage door ----
  const front = (r: Room) => exteriorSegments(r, rooms.filter((o) => o.id !== r.id)).filter((s) => s.side === "bottom" && Math.abs(s.fixed - D) < 0.02);
  const living = rooms.find((r) => r.type === "living");
  if (floorIndex === 0) {
    let placed = false;
    const entryRooms = [living, ...rooms.filter((r) => r.type === "reception" || r.type === "hall" || r.type === "lobby" || r.type === "corridor")].filter((r): r is Room => !!r);
    for (const r of entryRooms) {
      const segs = [...front(r)].sort((a, b) => b.to - b.from - (a.to - a.from));
      const all = [...segs, ...exteriorSegments(r, rooms.filter((o) => o.id !== r.id)).filter((s) => !segs.includes(s))];
      for (const s of all) {
        const c = place(s, 1.0, occupied, [0.35, 0.5, 0.65]);
        if (c != null) {
          specs.push({ floorIndex, kind: "door", ...centre(s, c), width: 1.0, height: 2.1, sill: 0, purpose: `Main entrance (${r.name})` });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) unreachable.push("Main entrance");
    for (const g of find("garage")) {
      const s = front(g).sort((a, b) => b.to - b.from - (a.to - a.from))[0];
      const c = s ? place(s, Math.min(2.4, s.to - s.from - 0.3), occupied, [0.5]) : null;
      if (s && c != null) specs.push({ floorIndex, kind: "door", ...centre(s, c), width: Math.min(2.4, s.to - s.from - 0.3), height: 2.1, sill: 0, purpose: "Garage door" });
    }
    for (const g of find("garage")) if (!connected.has([g.id, living?.id ?? ""].sort().join("|")) && living) link(living, g, "Living to Garage");
  }

  // ---- windows on exterior walls ----
  for (const r of rooms) {
    const segs: SideSeg[] = exteriorSegments(r, rooms.filter((o) => o.id !== r.id)).sort((a, b) => b.to - b.from - (a.to - a.from));
    const wet = r.type === "bathroom" || r.type === "toilet";
    if (["staircase", "lobby", "store", "utility", "garage", "balcony", "corridor", "lift", "parking"].includes(r.type)) continue;
    let count = 0;
    const want = 1;
    for (const s of segs) {
      const len = s.to - s.from;
      const w = wet ? 0.6 : r.type === "living" ? (len >= 3.0 ? 1.8 : 1.2) : r.type === "bedroom" || r.type === "master-bedroom" ? (len >= 3.4 ? 1.5 : 1.2) : 1.2;
      const h = wet ? 0.6 : 1.2;
      const sill = wet ? 1.5 : 0.9;
      const fr = len >= 4.2 && !wet ? [0.27, 0.73] : [0.5, 0.3, 0.7];
      const k = len >= 4.2 && !wet ? 2 : 1;
      for (let j = 0; j < k; j++) {
        for (const ww of wet ? [w] : [w, 1.2, 0.9]) {
          const c = place(s, ww, occupied, k === 2 ? [fr[j]] : fr);
          if (c != null) {
            specs.push({ floorIndex, kind: "window", ...centre(s, c), width: ww, height: h, sill, purpose: `${r.name} window` });
            count++;
            break;
          }
        }
      }
      if (count >= want) break;
    }
    if (count === 0) missingWindows.push(r.name);
  }
  return { specs, unreachable, missingWindows };
}

/* ---------------- main entry ---------------- */

export function validateInput(plot: Plot, input: AutoDesignInput): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(input.floors) || input.floors < AUTODESIGN_LIMITS.floors[0] || input.floors > AUTODESIGN_LIMITS.floors[1]) errs.push("Floors must be a whole number from 1 to 4.");
  if (!Number.isInteger(input.bedrooms) || input.bedrooms < AUTODESIGN_LIMITS.bedrooms[0] || input.bedrooms > AUTODESIGN_LIMITS.bedrooms[1]) errs.push("Bedrooms must be a whole number from 1 to 5.");
  for (const [k, v] of [["front setback", input.setbackFront], ["rear setback", input.setbackRear], ["side setback", input.setbackSide]] as const) {
    if (!Number.isFinite(v) || v < 0) errs.push(`The ${k} must be zero or more.`);
  }
  if (!(plot.width > 0) || !(plot.depth > 0)) errs.push("Plot width and depth must be greater than zero.");
  return errs;
}

export function generateOptions(plot: Plot, input: AutoDesignInput): GenerateResult {
  const errors = validateInput(plot, input);
  if (errors.length) return { options: [], errors };
  const programs = buildPrograms(input);
  if (typeof programs === "string") return { options: [], errors: [programs] };

  const envW = roundMm(plot.width - 2 * input.setbackSide);
  const envD = roundMm(plot.depth - input.setbackFront - input.setbackRear);
  if (envW < 3.6 || envD < 3.6) {
    return { options: [], errors: [`After setbacks the buildable area is ${Math.max(0, envW).toFixed(1)} x ${Math.max(0, envD).toFixed(1)} m, which is too small for any room layout. Reduce the setbacks or use a larger plot.`] };
  }

  // footprint size: cap how far rooms grow beyond their usual sizes unless "fill" is chosen
  const programArea = Math.max(
    ...programs.map((p, i) => sum([...p.front, ...p.rear].map((x) => x.target + (x.balcony ? 3 : 0))) + (input.floors > 1 ? CORE_W * 7.5 : 0) + (p.corridor ? CORR_D * 6 : 0) + (i === 0 ? 0 : 0)),
  );
  const growth = input.sizing === "standard" ? 1.3 : input.sizing === "spacious" ? 1.75 : Infinity;
  const maxArea = programArea * growth;
  // try the full scale first; shrink step by step until a layout fits (never exceeds the envelope)
  const sizes: Array<[number, number]> = [];
  let capCount = 0;
  if (growth === Infinity) { sizes.push([envW, envD]); capCount = 1; }
  else {
    const fr = [0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1];
    for (const fw of fr) for (const fd of fr) {
      const W = snap(envW * fw);
      const D = snap(envD * fd);
      if (W * D <= maxArea * 1.0001 || (fw === 1 && fd === 1 && false)) sizes.push([W, D]);
    }
    capCount = sizes.length;
    // if the programme needs more than the cap, allow larger footprints up to the whole buildable area
    for (const fw of fr) for (const fd of fr) {
      const W = snap(envW * fw);
      const D = snap(envD * fd);
      if (W * D > maxArea * 1.0001) sizes.push([W, D]);
    }
  }
  const variants: Variant[] = [];
  for (const coreLeft of [true, false]) for (const frontFirst of [false, true]) for (const rearFirst of [false, true]) variants.push({ coreLeft, frontFirst, rearFirst });

  const found: DesignOption[] = [];
  const seen = new Set<string>();
  const reasons = new Set<string>();
  for (let si = 0; si < sizes.length; si++) {
    if (si === capCount && found.length) break;
    const [W0, D0] = sizes[si];
    const W = Math.min(W0, envW);
    const D = Math.min(D0, envD);
    for (const v of variants) {
      const lp = layoutVariant(W, D, input, programs, v);
      if (!lp.ok) { if (lp.reason) reasons.add(lp.reason); continue; }
      const opt = finish(plot, input, programs, lp, v, W, D);
      if (typeof opt === "string") { reasons.add(opt); continue; }
      const key = opt.floors.map((f) => f.rooms.map((r) => `${r.type}${r.x}${r.y}${r.width}${r.depth}`).join(",")).join("/");
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(opt);
    }
  }
  if (!found.length) {
    return { options: [], errors: [`No layout fits ${envW.toFixed(1)} x ${envD.toFixed(1)} m of buildable area for ${input.bedrooms} bedroom(s) on ${input.floors} floor(s). ${[...reasons].slice(0, 2).join(" ")} Try fewer bedrooms, more floors, or smaller setbacks.`.trim()] };
  }
  found.sort((a, b) => b.score - a.score);
  const top: DesignOption[] = [];
  const sig = (o: DesignOption) => o.summary;
  for (const o of found) if (top.length < 3 && !top.some((t) => sig(t) === sig(o))) top.push(o);
  for (const o of found) if (top.length < 3 && !top.includes(o)) top.push(o);
  top.forEach((o, i) => {
    o.id = `option_${i + 1}`;
    o.label = `Option ${String.fromCharCode(65 + i)}`;
  });
  return { options: top, errors: [] };
}

function finish(
  plot: Plot,
  input: AutoDesignInput,
  programs: FloorProgram[],
  lp: LocalPlan,
  v: Variant,
  W: number,
  D: number,
): DesignOption | string {
  const hasStair = input.floors > 1;
  const specsLocal: OpeningSpec[] = [];
  const notes: string[] = [];
  let penalty = 0;
  for (let i = 0; i < lp.floors.length; i++) {
    const c = planOpenings(i, lp.floors[i], D, hasStair);
    if (c.unreachable.length) return `${c.unreachable[0]} cannot be reached by a door`; // never offer a layout where a room cannot be entered
    specsLocal.push(...c.specs);
    for (const m of c.missingWindows) {
      penalty += 6;
      notes.push(`${i === 0 ? "Ground floor" : `Floor ${i + 1}`}: ${m} has no outside wall, so no window.`);
    }
  }
  // transform from the local frame (front edge at local y = D) to plot coordinates
  const flip = input.frontSide === "top";
  const ox = roundMm(input.setbackSide);
  const oy = flip ? roundMm(input.setbackFront) : roundMm(plot.depth - input.setbackFront - D);
  const floors: PlannedFloor[] = lp.floors.map((rooms, i) => ({
    name: i === 0 ? "Ground Floor" : "",
    rooms: rooms.map((r) => ({ ...r, x: roundMm(ox + r.x), y: roundMm(flip ? oy + D - (r.y + r.depth) : oy + r.y) })),
  }));
  const openings = specsLocal.map((s) => ({ ...s, x: roundMm(ox + s.x), y: roundMm(flip ? oy + D - s.y : oy + s.y) }));

  // ---- scoring (all heuristics, shown to the user only as a rough ranking) ----
  let score = 100 - penalty;
  const targetOf = (r: Room) => TARGET[r.type];
  for (const f of floors) {
    for (const r of f.rooms) {
      const ratio = Math.max(r.width, r.depth) / Math.min(r.width, r.depth);
      if (!["staircase", "balcony", "lobby", "toilet", "bathroom", "store", "garage"].includes(r.type) && ratio > 1.5) score -= (ratio - 1.5) * 5;
      const t = targetOf(r);
      if (t) {
        const a = r.width * r.depth;
        if (a < 0.85 * t) score -= ((0.85 * t - a) / t) * 20;
        if (a > 2 * t && ["bedroom", "master-bedroom", "kitchen", "dining", "study"].includes(r.type)) score -= 2;
      }
    }
  }
  const living = floors[0].rooms.find((r) => r.type === "living");
  const kitchen = floors[0].rooms.find((r) => r.type === "kitchen");
  if (living && kitchen && sharedSegment(living, kitchen)) score += 4;
  const layoutName = `${v.coreLeft ? "stairs/bath core on the left" : "stairs/bath core on the right"}`;
  const builtUp = sum(floors.map((f) => sum(f.rooms.map((r) => r.width * r.depth))));
  return {
    id: "",
    label: "",
    summary: `${hasStair ? `${layoutName}, ` : ""}${W.toFixed(2)} x ${D.toFixed(2)} m footprint${v.frontFirst || v.rearFirst ? ", rooms mirrored" : ""}`,
    score: Math.round(score * 10) / 10,
    floors,
    openings,
    footprint: { x: ox, y: oy, width: W, depth: D },
    builtUpArea: roundMm(builtUp),
    notes,
  };
}

/* ---------------- applying an option ---------------- */

export interface ApplyResult {
  project: Project;
  /** openings that could not be attached (should be empty) */
  failed: string[];
}

/** Replace the current design with the option. One pure function = one undo step in the editor. */
export function applyOption(project: Project, option: DesignOption): ApplyResult {
  const failed: string[] = [];
  const count = option.floors.length;
  let floors: Floor[] = project.floors.slice(0, count).map((f) => ({ ...f, rooms: [], walls: [], openings: [], dimensions: [] }));
  while (floors.length < count) floors.push(createFloor(floors.length, option.floorHeight ?? project.floors[0]?.height));
  if (option.floorHeight) floors = floors.map((f) => ({ ...f, height: option.floorHeight as number }));
  let p: Project = { ...project, floors, updatedAt: new Date().toISOString() };
  floors = p.floors;
  option.floors.forEach((pf, i) => {
    const id = floors[i].id;
    const rooms = pf.rooms.map((r) => ({ ...r, id: newId("room") }));
    p = mapFloor(p, id, (f) => ({ ...f, rooms }));
    p = generateWalls(p, id);
    const fp = option.footprint;
    p = addDimension(p, id, fp.x, fp.y, fp.x + fp.width, fp.y).project;
    p = addDimension(p, id, fp.x, fp.y, fp.x, fp.y + fp.depth).project;
  });
  const order = (s: OpeningSpec) => (s.kind === "door" ? 0 : 1);
  for (const s of [...option.openings].sort((a, b) => order(a) - order(b))) {
    const floor = p.floors[s.floorIndex];
    let best: { id: string; t: number; dist: number } | null = null;
    for (const w of floor.walls) {
      const pr = projectOnWall(w, { x: s.x, y: s.y });
      if (pr.t < 0 || pr.t > wallLength(w)) continue;
      if (pr.dist < 0.03 && (!best || pr.dist < best.dist)) best = { id: w.id, t: pr.t, dist: pr.dist };
    }
    if (!best) {
      failed.push(`${s.purpose}: no wall found`);
      continue;
    }
    const res = addOpeningOnWall(p, floor.id, best.id, s.kind, best.t, { width: s.width, height: s.height, sill: s.sill });
    if ("error" in res) failed.push(`${s.purpose}: ${res.error}`);
    else p = res.project;
  }
  return { project: p, failed };
}
