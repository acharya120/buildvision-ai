import type { Plot, Room, RoomType } from "../model/types";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { roundMm } from "../geometry/rect";
import {
  COMMERCIAL_LIMITS,
  mk,
  planOpenings,
  snap,
  splitLengths,
  sum,
  type DesignOption,
  type GenerateResult,
  type PlannedFloor,
  type Sizing,
} from "./autodesign";

/**
 * Rule-based generator for non-residential buildings (offices, hotels, schools, hospitals, shops,
 * warehouses ...): a double-loaded corridor with a stair/lift core and toilets at one end and a
 * reception on the ground floor. Same limits as the house generator: a rule-based concept, not AI,
 * not an architect, and no fire-exit, accessibility or code checks of any kind.
 */
export interface CommercialInput {
  floors: number;
  /** type of the repeated room (office, ward, classroom, hotel bedroom, shop ...) */
  roomType: RoomType;
  /** rooms of that type per floor; 0 = as many as fit */
  roomsPerFloor: number;
  /** target room size used to decide the footprint (m) */
  roomWidth: number;
  roomDepth: number;
  includeLift: boolean;
  groundReception: boolean;
  floorHeight: number;
  frontSide: "bottom" | "top";
  setbackFront: number;
  setbackRear: number;
  setbackSide: number;
  sizing: Sizing;
}

export const DEFAULT_COMMERCIAL_INPUT: CommercialInput = {
  floors: 3,
  roomType: "office",
  roomsPerFloor: 0,
  roomWidth: 4.0,
  roomDepth: 5.0,
  includeLift: true,
  groundReception: true,
  floorHeight: 3.6,
  frontSide: "bottom",
  setbackFront: 0,
  setbackRear: 0,
  setbackSide: 0,
  sizing: "standard",
};

/** Sensible starting inputs per building type (all editable in the form). */
export const COMMERCIAL_PRESETS: Record<string, Partial<CommercialInput>> = {
  office: { roomType: "office", roomWidth: 4.0, roomDepth: 5.0, floors: 4 },
  hotel: { roomType: "bedroom", roomWidth: 3.6, roomDepth: 5.0, floors: 4, floorHeight: 3.2 },
  school: { roomType: "classroom", roomWidth: 7.5, roomDepth: 6.0, floors: 3 },
  hospital: { roomType: "ward", roomWidth: 4.0, roomDepth: 5.0, floors: 4 },
  shop: { roomType: "shop", roomWidth: 4.0, roomDepth: 6.0, floors: 1 },
  mall: { roomType: "shop", roomWidth: 5.0, roomDepth: 8.0, floors: 3, floorHeight: 4.2 },
  restaurant: { roomType: "hall", roomWidth: 8.0, roomDepth: 7.0, floors: 1, roomsPerFloor: 2 },
  warehouse: { roomType: "warehouse", roomWidth: 12.0, roomDepth: 14.0, floors: 1, roomsPerFloor: 2, floorHeight: 7.0, includeLift: false },
  factory: { roomType: "workshop", roomWidth: 10.0, roomDepth: 12.0, floors: 1, roomsPerFloor: 4, floorHeight: 6.0, includeLift: false },
  "mixed-use": { roomType: "shop", roomWidth: 4.5, roomDepth: 6.0, floors: 4 },
  "community-hall": { roomType: "hall", roomWidth: 10.0, roomDepth: 9.0, floors: 1, roomsPerFloor: 2 },
};

const MIN_W = 2.4;
const MIN_D = 2.7;

export function validateCommercialInput(plot: Plot, i: CommercialInput): string[] {
  const e: string[] = [];
  if (!Number.isInteger(i.floors) || i.floors < COMMERCIAL_LIMITS.floors[0] || i.floors > COMMERCIAL_LIMITS.floors[1]) e.push("Floors must be a whole number from 1 to 100.");
  if (!Number.isInteger(i.roomsPerFloor) || i.roomsPerFloor < 0 || i.roomsPerFloor > 400) e.push("Rooms per floor must be a whole number from 0 (fit as many as possible) to 400.");
  for (const [k, v] of [["Room width", i.roomWidth], ["Room depth", i.roomDepth]] as const) if (!(v >= MIN_W)) e.push(`${k} must be at least ${MIN_W} m.`);
  if (!(i.floorHeight >= 2.4 && i.floorHeight <= 30)) e.push("Floor height must be between 2.4 and 30 m.");
  for (const [k, v] of [["front setback", i.setbackFront], ["rear setback", i.setbackRear], ["side setback", i.setbackSide]] as const) if (!Number.isFinite(v) || v < 0) e.push(`The ${k} must be zero or more.`);
  if (!(plot.width > 0) || !(plot.depth > 0)) e.push("Plot width and depth must be greater than zero.");
  return e;
}

interface CVariant {
  coreLeft: boolean;
  corridor: number;
}

function layoutFloor(W: number, D: number, input: CommercialInput, v: CVariant, floorIndex: number, nRooms: number): Room[] | string {
  const n = input.floors;
  const hasStair = n > 1;
  const cwd = v.corridor;
  const rowD = snap((D - cwd) / 2);
  if (rowD < MIN_D) return "The building is too shallow for two rows of rooms and a corridor.";
  const rearD = rowD;
  const frontD = roundMm(D - rearD - cwd);
  const stairW = hasStair ? 2.4 : 0;
  const liftW = hasStair && input.includeLift ? 2.0 : 0;
  const coreW = stairW + liftW;
  const toiletW = Math.max(coreW, 2.4);
  const coreSpan = Math.max(coreW, toiletW);
  const roomsW = roundMm(W - coreSpan);
  if (roomsW < MIN_W) return "The building is too narrow for the core and any rooms.";
  const label = ROOM_TYPE_LABELS[input.roomType].split(" / ")[0];
  const nRear = Math.ceil(nRooms / 2);
  const nFront = nRooms - nRear;
  const x0 = v.coreLeft ? coreSpan : 0; // x where the room area begins
  const coreX = v.coreLeft ? 0 : roundMm(W - coreSpan);
  const rooms: Room[] = [];
  let counter = 0;
  const roomName = () => `${label} ${(floorIndex + 1) * 100 + ++counter}`;

  const row = (count: number, y: number, depth: number, extraFirst?: { type: RoomType; name: string; want: number; min: number }): Room[] | null => {
    const items: Array<{ type: RoomType; name: string; want: number; min: number }> = [];
    if (extraFirst) items.push(extraFirst);
    for (let k = 0; k < count; k++) items.push({ type: input.roomType, name: roomName(), want: 1, min: MIN_W });
    if (!items.length) return [];
    const wants = items.map((it) => (it === extraFirst ? Math.max(1.2, extraFirst.want) : 1));
    const lens = splitLengths(roomsW, wants, items.map((it) => it.min));
    if (!lens) return null;
    const out: Room[] = [];
    let x = x0;
    items.forEach((it, k) => {
      out.push(mk(it.type, it.name, x, y, lens[k], depth));
      x = roundMm(x + lens[k]);
    });
    return out;
  };

  // rear row: stair and lift next to the corridor, then rooms
  const rear = row(nRear, 0, rearD);
  // front row: toilets next to the corridor, reception at the entrance on the ground floor
  const reception = floorIndex === 0 && input.groundReception ? { type: "reception" as RoomType, name: "Reception", want: 1.6, min: 3.0 } : undefined;
  const front = row(nFront, roundMm(rearD + cwd), frontD, reception);
  if (!rear || !front) return "The rooms do not fit this footprint at their minimum size.";
  rooms.push(...rear, ...front);

  if (hasStair) {
    rooms.push(mk("staircase", "Staircase", v.coreLeft ? 0 : coreX, 0, stairW, rearD));
    if (liftW) rooms.push(mk("lift", "Lift", v.coreLeft ? stairW : coreX + stairW, 0, liftW, rearD));
    if (coreSpan > coreW) rooms.push(mk("store", "Store", v.coreLeft ? coreW : coreX + coreW, 0, roundMm(coreSpan - coreW), rearD));
  } else {
    rooms.push(mk("store", "Store", coreX, 0, coreSpan, rearD));
  }
  const half = roundMm(coreSpan / 2);
  rooms.push(mk("toilet", "Toilet (M)", coreX, roundMm(rearD + cwd), half, frontD));
  rooms.push(mk("toilet", "Toilet (F)", roundMm(coreX + half), roundMm(rearD + cwd), roundMm(coreSpan - half), frontD));
  rooms.push(mk("corridor", "Corridor", 0, rearD, W, cwd));
  return rooms;
}

export function generateCommercialOptions(plot: Plot, input: CommercialInput): GenerateResult {
  const errors = validateCommercialInput(plot, input);
  if (errors.length) return { options: [], errors };
  const envW = roundMm(plot.width - 2 * input.setbackSide);
  const envD = roundMm(plot.depth - input.setbackFront - input.setbackRear);
  if (envW < 8 || envD < 8) return { options: [], errors: [`After setbacks the buildable area is ${Math.max(0, envW).toFixed(1)} x ${Math.max(0, envD).toFixed(1)} m, which is too small for a corridor building (needs at least 8 x 8 m). Reduce the setbacks or use a larger plot.`] };

  const found: DesignOption[] = [];
  const reasons = new Set<string>();
  const variants: CVariant[] = [];
  for (const coreLeft of [true, false]) for (const corridor of [1.8, 2.4]) variants.push({ coreLeft, corridor });

  for (const v of variants) {
    const stairW = input.floors > 1 ? 2.4 : 0;
    const liftW = input.floors > 1 && input.includeLift ? 2.0 : 0;
    const coreSpan = Math.max(stairW + liftW, 2.4);
    // footprint from the room targets, never beyond the buildable area
    const recep = input.groundReception ? 1 : 0;
    let W: number;
    let nRooms: number;
    if (input.roomsPerFloor > 0) {
      nRooms = input.roomsPerFloor;
      const nRear = Math.ceil(nRooms / 2);
      const frontSlots = nRooms - nRear + recep * 1.6;
      const slots = Math.max(nRear, frontSlots, 1);
      W = input.sizing === "fill" ? envW : Math.min(envW, snap(coreSpan + slots * input.roomWidth));
    } else {
      W = envW;
      const perRow = Math.max(1, Math.floor((W - coreSpan) / input.roomWidth));
      nRooms = Math.max(2, 2 * perRow - recep);
      if (input.sizing !== "fill") W = Math.min(envW, snap(coreSpan + perRow * input.roomWidth));
    }
    const D = input.sizing === "fill" ? envD : Math.min(envD, snap(v.corridor + 2 * input.roomDepth));
    const maxFit = 2 * Math.floor((W - coreSpan) / MIN_W);
    if (nRooms > maxFit) {
      reasons.add(`${nRooms} rooms per floor need a wider building than ${W.toFixed(1)} m (about ${maxFit} fit at the minimum room width ${MIN_W} m).`);
      continue;
    }
    // reception takes one slot of the front row on the ground floor
    const floors: Room[][] = [];
    let failed: string | null = null;
    for (let i = 0; i < input.floors; i++) {
      const r = layoutFloor(W, D, input, v, i, nRooms);
      if (typeof r === "string") { failed = r; break; }
      floors.push(r);
    }
    if (failed) { reasons.add(failed); continue; }

    // doors and windows
    const specs: DesignOption["openings"] = [];
    const notes: string[] = [];
    let bad: string | null = null;
    for (let i = 0; i < floors.length; i++) {
      const c = planOpenings(i, floors[i], D, input.floors > 1);
      if (c.unreachable.length) { bad = `${c.unreachable[0]} cannot be reached by a door`; break; }
      specs.push(...c.specs);
      for (const m of c.missingWindows) notes.push(`${i === 0 ? "Ground floor" : `Floor ${i + 1}`}: ${m} has no outside wall, so no window.`);
    }
    if (bad) { reasons.add(bad); continue; }

    const flip = input.frontSide === "top";
    const ox = roundMm(input.setbackSide);
    const oy = flip ? roundMm(input.setbackFront) : roundMm(plot.depth - input.setbackFront - D);
    const planned: PlannedFloor[] = floors.map((rooms, i) => ({
      name: i === 0 ? "Ground Floor" : "",
      rooms: rooms.map((r) => ({ ...r, x: roundMm(ox + r.x), y: roundMm(flip ? oy + D - (r.y + r.depth) : oy + r.y) })),
    }));
    const openings = specs.map((s) => ({ ...s, x: roundMm(ox + s.x), y: roundMm(flip ? oy + D - s.y : oy + s.y) }));
    let score = 100 - notes.length * 5;
    const repeated = floors[0].filter((r) => r.type === input.roomType);
    for (const r of repeated) {
      const ratio = Math.max(r.width, r.depth) / Math.min(r.width, r.depth);
      if (ratio > 2) score -= (ratio - 2) * 3;
      const a = r.width * r.depth;
      const t = input.roomWidth * input.roomDepth;
      score -= (Math.abs(a - t) / t) * 8;
    }
    const net = sum(floors[0].filter((r) => r.type !== "corridor").map((r) => r.width * r.depth));
    score += (net / (W * D)) * 10;
    found.push({
      id: "",
      label: "",
      summary: `core on the ${v.coreLeft ? "left" : "right"}, ${v.corridor.toFixed(1)} m corridor, ${nRooms} ${ROOM_TYPE_LABELS[input.roomType].split(" / ")[0].toLowerCase()}(s) per floor, ${W.toFixed(1)} x ${D.toFixed(1)} m footprint`,
      score: Math.round(score * 10) / 10,
      floors: planned,
      openings,
      floorHeight: input.floorHeight,
      footprint: { x: ox, y: oy, width: W, depth: D },
      builtUpArea: roundMm(sum(planned.map((f) => sum(f.rooms.map((r) => r.width * r.depth))))),
      notes,
    });
  }
  if (!found.length) {
    return { options: [], errors: [`No corridor layout fits ${envW.toFixed(1)} x ${envD.toFixed(1)} m of buildable area. ${[...reasons].slice(0, 2).join(" ")} Try fewer rooms per floor, smaller rooms, or smaller setbacks.`.trim()] };
  }
  found.sort((a, b) => b.score - a.score);
  const top = found.slice(0, 3);
  top.forEach((o, i) => {
    o.id = `option_${i + 1}`;
    o.label = `Option ${String.fromCharCode(65 + i)}`;
  });
  return { options: top, errors: [] };
}
