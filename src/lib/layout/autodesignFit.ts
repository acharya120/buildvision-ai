import type { Plot, Room, RoomType } from "../model/types";
import { roundMm } from "../geometry/rect";
import { finish, generateOptions, mk, snap, type AutoDesignInput, type DesignOption, type LocalPlan } from "./autodesign";
import { DEFAULT_COMMERCIAL_INPUT, generateCommercialOptions, type CommercialInput } from "./autodesignCorridor";

export interface FitResult {
  options: DesignOption[];
  errors: string[];
  /** plain-language list of what was changed so that a design could be produced */
  adjustments: string[];
}

/**
 * Compact "studio" layout for very small or very narrow plots: one main room, a kitchen and a
 * bathroom in a row (wide plot) or a column (deep plot). Needs at least about 2.4 x 4.5 m.
 */
export function generateStudio(plot: Plot, input: Pick<AutoDesignInput, "frontSide" | "setbackFront" | "setbackRear" | "setbackSide" | "northAngle">, main: RoomType = "living"): FitResult {
  const envW = roundMm(plot.width - 2 * input.setbackSide);
  const envD = roundMm(plot.depth - input.setbackFront - input.setbackRear);
  const wide = envW >= envD;
  const along = wide ? envW : envD;
  const across = wide ? envD : envW;
  const kitchenType: RoomType = main === "living" ? "kitchen" : "pantry";
  const bathType: RoomType = main === "living" ? "bathroom" : "toilet";
  const minAcross = 1.8;
  const minAlong = 1.2 + 1.2 + 1.8; // kitchen + bath + main room (4.2 m)
  if (across < minAcross || along < minAlong) {
    return { options: [], adjustments: [], errors: [`The buildable area is ${Math.max(0, envW).toFixed(1)} x ${Math.max(0, envD).toFixed(1)} m after setbacks. Even a one-room studio needs about ${minAcross} x ${minAlong} m. Reduce the setbacks, or check the plot size.`] };
  }
  const input1: AutoDesignInput = { floors: 1, bedrooms: 1, includeDining: false, includeStudy: false, includeGarage: false, includeBalcony: false, includeUtility: false, attachedBathMaster: false, northAngle: input.northAngle, frontSide: input.frontSide, setbackFront: input.setbackFront, setbackRear: input.setbackRear, setbackSide: input.setbackSide, sizing: "standard" };
  // split the long side: main room gets what is left after a kitchen and a bathroom of usual depth
  const kitchenLen = Math.min(2.7, Math.max(1.2, snap(along * 0.22)));
  const bathLen = Math.min(2.4, Math.max(1.2, snap(along * 0.2)));
  const mainLen = roundMm(along - kitchenLen - bathLen);
  const options: DesignOption[] = [];
  const reasons: string[] = [];
  const K: [RoomType, string, number] = [kitchenType, main === "living" ? "Kitchen" : "Pantry", kitchenLen];
  const B: [RoomType, string, number] = [bathType, main === "living" ? "Bathroom" : "Toilet", bathLen];
  const M: [RoomType, string, number] = [main, main === "living" ? "Living / Bedroom" : "Main Room", mainLen];
  // the main room sits between the other two so both can open onto it
  const orders: Array<Array<[RoomType, string, number]>> = [[K, M, B], [B, M, K]];
  orders.forEach((order, k) => {
    const rooms: Room[] = [];
    let pos = 0;
    for (const [type, name, len] of order) {
      rooms.push(wide ? mk(type, name, pos, 0, len, across) : mk(type, name, 0, pos, across, len));
      pos = roundMm(pos + len);
    }
    const lp: LocalPlan = { floors: [rooms], ok: true };
    const opt = finish(plot, input1, [], lp, { coreLeft: k === 0, frontFirst: false, rearFirst: false }, wide ? along : across, wide ? across : along);
    if (typeof opt === "string") reasons.push(opt);
    else {
      opt.summary = `compact studio, ${opt.footprint.width.toFixed(1)} x ${opt.footprint.depth.toFixed(1)} m`;
      options.push(opt);
    }
  });
  options.sort((a, b) => b.score - a.score);
  options.forEach((o, i) => { o.id = `option_${i + 1}`; o.label = `Option ${String.fromCharCode(65 + i)}`; });
  if (!options.length) return { options: [], adjustments: [], errors: [`A studio layout could not be fitted on this plot${reasons[0] ? ` (${reasons[0]})` : ""}.`] };
  return { options, errors: [], adjustments: [] };
}

const RESIDENTIAL = ["single-floor", "duplex", "triplex", "bungalow", "villa", "apartment", "farmhouse", "custom"];
export const isResidentialType = (t: string) => RESIDENTIAL.includes(t);

/** House generator that never gives up silently: it relaxes the brief step by step and reports every change. */
export function generateHouseWithFit(plot: Plot, input: AutoDesignInput): FitResult {
  const direct = generateOptions(plot, input);
  if (direct.options.length) return { ...direct, adjustments: [] };
  const adjustments: string[] = [];
  let cur = { ...input };
  const attempt = (): FitResult | null => {
    const r = generateOptions(plot, cur);
    return r.options.length ? { ...r, adjustments: [...adjustments] } : null;
  };
  // 1. drop optional rooms
  const optional: Array<[keyof AutoDesignInput, string]> = [["includeGarage", "garage"], ["includeUtility", "utility room"], ["includeStudy", "study"], ["attachedBathMaster", "bathroom next to the master bedroom"], ["includeDining", "separate dining room"], ["includeBalcony", "balcony"]];
  for (const [k, label] of optional) {
    if (cur[k]) {
      cur = { ...cur, [k]: false } as AutoDesignInput;
      adjustments.push(`Removed the ${label}.`);
      const r = attempt();
      if (r) return r;
    }
  }
  // 2. add floors (the same rooms on a smaller footprint), up to 4
  const startFloors = cur.floors;
  for (let f = startFloors + 1; f <= 4; f++) {
    const c2 = { ...cur, floors: f };
    const r = generateOptions(plot, c2);
    if (r.options.length) return { ...r, adjustments: [...adjustments, `Increased floors from ${startFloors} to ${f} so the rooms fit on this plot.`] };
  }
  // 3. fewer bedrooms
  const startBeds = cur.bedrooms;
  for (let b = startBeds - 1; b >= 1; b--) {
    for (const f of [cur.floors, ...[2, 3, 4].filter((x) => x > cur.floors)]) {
      const r = generateOptions(plot, { ...cur, bedrooms: b, floors: f });
      if (r.options.length)
        return { ...r, adjustments: [...adjustments, `Reduced bedrooms from ${startBeds} to ${b}${f !== cur.floors ? ` and used ${f} floors` : ""} so a layout fits.`] };
    }
  }
  // 4. compact studio
  const studio = generateStudio(plot, input);
  if (studio.options.length) return { ...studio, adjustments: [...adjustments, "The plot is too small for a normal house layout, so a compact studio (one room, kitchen, bathroom) was generated."] };
  return { options: [], adjustments: [], errors: studio.errors };
}

export function generateCorridorWithFit(plot: Plot, input: CommercialInput): FitResult {
  const direct = generateCommercialOptions(plot, input);
  if (direct.options.length) return { ...direct, adjustments: [] };
  const adjustments: string[] = [];
  // 1. fewer, then smaller rooms
  if (input.roomsPerFloor > 2) {
    for (const n of [Math.ceil(input.roomsPerFloor / 2), 2]) {
      const r = generateCommercialOptions(plot, { ...input, roomsPerFloor: n });
      if (r.options.length) return { ...r, adjustments: [`Reduced rooms per floor from ${input.roomsPerFloor} to ${n} so a layout fits.`] };
    }
  }
  const smaller = { ...input, roomWidth: Math.max(2.4, input.roomWidth * 0.7), roomDepth: Math.max(2.7, input.roomDepth * 0.7), roomsPerFloor: input.roomsPerFloor > 0 ? Math.min(input.roomsPerFloor, 4) : 0 };
  const r2 = generateCommercialOptions(plot, smaller);
  if (r2.options.length) return { ...r2, adjustments: ["Made the rooms smaller so a layout fits."] };
  // 2. a compact single unit (shop / office / main room) with its own toilet
  const main: RoomType = input.roomType === "bedroom" ? "living" : input.roomType;
  const studio = generateStudio(plot, { ...DEFAULT_COMMERCIAL_INPUT, ...input, northAngle: 0 }, main);
  if (studio.options.length) return { ...studio, adjustments: ["The plot is too small for a corridor building, so a single compact unit with a pantry and toilet was generated."] };
  return { options: [], adjustments: [], errors: studio.errors };
}
