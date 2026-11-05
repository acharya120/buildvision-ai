import type { Project, RoomType } from "../model/types";
import { ROOM_TYPE_LABELS, makeRoom } from "../model/defaults";
import { addRoom, findFreeSpot, getFloor, setPlot, totalRoomArea, updateRoom } from "../model/ops";
import { formatArea, formatLength, parseLength } from "../model/units";
import { validateProject } from "../validation/validate";
import { buildEstimate } from "../estimate/estimate";

/**
 * RULE-BASED assistant. It understands a small fixed set of phrases with plain pattern matching.
 * It is NOT an AI model and never calls an external service.
 */
export interface Proposal {
  kind: "edit" | "answer" | "unknown";
  message: string;
  /** present for edits that can be applied */
  apply?: (p: Project) => Project;
  /** problems the edit would introduce, shown before applying */
  warnings: string[];
}

const ROOM_WORDS: Array<[RegExp, RoomType]> = [
  [/master\s*bed ?room/, "master-bedroom"],
  [/bed ?room/, "bedroom"],
  [/living( room)?|hall|drawing room/, "living"],
  [/kitchen/, "kitchen"],
  [/dining/, "dining"],
  [/bath ?room|washroom/, "bathroom"],
  [/toilet|wc/, "toilet"],
  [/utility/, "utility"],
  [/store( room)?/, "store"],
  [/study|office/, "study"],
  [/balcony/, "balcony"],
  [/lobby/, "lobby"],
  [/stair ?case|stairs/, "staircase"],
  [/garage|parking/, "garage"],
];

function roomTypeIn(text: string): RoomType | null {
  for (const [re, t] of ROOM_WORDS) if (re.test(text)) return t;
  return null;
}

const ORDINALS: Array<[RegExp, number]> = [
  [/ground|first floor index/, 0],
  [/\bfirst\b/, 1],
  [/\bsecond\b/, 2],
  [/\bthird\b/, 3],
  [/\bfourth\b/, 4],
];

function floorIndexIn(text: string, p: Project, fallbackFloorId: string): number {
  if (/ground/.test(text)) return 0;
  for (const [re, idx] of ORDINALS.slice(1)) if (re.test(text) && idx < p.floors.length) return idx;
  const byName = p.floors.findIndex((f) => text.includes(f.name.toLowerCase()));
  if (byName >= 0) return byName;
  return Math.max(0, p.floors.findIndex((f) => f.id === fallbackFloorId));
}

function newErrors(before: Project, after: Project): string[] {
  const had = new Set(validateProject(before).filter((i) => i.severity === "error").map((i) => i.message));
  return validateProject(after)
    .filter((i) => i.severity === "error" && !had.has(i.message))
    .map((i) => i.message);
}

export const ASSISTANT_HELP = [
  'Add a bedroom to the first floor',
  'Make the kitchen wider (or "wider by 0.5 m")',
  "Change the plot to 25 by 40 feet",
  "Show me the total room area",
  "Estimate the flooring material",
];

export function interpret(input: string, p: Project, activeFloorId: string): Proposal {
  const text = input.trim().toLowerCase();
  if (!text) return { kind: "unknown", message: "Type a request first.", warnings: [] };

  // ---- add a room ----
  let m = text.match(/^(?:please )?(?:add|create|put)\s+(?:a |an |one )?(.+?)(?:\s+(?:to|on|in|at)\s+(?:the )?(.+))?$/);
  if (m) {
    const type = roomTypeIn(m[1]);
    if (type) {
      const floorIdx = floorIndexIn(m[2] ?? "", p, activeFloorId);
      const floor = p.floors[floorIdx];
      if (!floor) return { kind: "unknown", message: "That floor does not exist in this project.", warnings: [] };
      const room = makeRoom(type, 0, 0);
      const spot = findFreeSpot(p, floor.id, room.width, room.depth, p.settings.gridStep);
      if (!spot) {
        return {
          kind: "edit",
          message: `There is no free ${room.width.toFixed(1)} x ${room.depth.toFixed(1)} m space for a ${ROOM_TYPE_LABELS[type].toLowerCase()} on ${floor.name}. Resize or remove a room, or enlarge the plot.`,
          warnings: [],
        };
      }
      room.x = spot.x;
      room.y = spot.y;
      const next = addRoom(p, floor.id, room);
      return {
        kind: "edit",
        message: `Add "${room.name}" (${formatLength(room.width, p.unitSystem)} x ${formatLength(room.depth, p.unitSystem)}) to ${floor.name} at the first free position.`,
        apply: (proj) => addRoom(proj, floor.id, { ...room }),
        warnings: newErrors(p, next),
      };
    }
  }

  // ---- resize a room ----
  m = text.match(/^(?:please )?make\s+(?:the )?(.+?)\s+(wider|narrower|deeper|longer|shallower|larger|bigger|smaller)(?:\s+by\s+(.+))?$/);
  if (m) {
    const type = roomTypeIn(m[1]);
    const floor = getFloor(p, activeFloorId) ?? p.floors[0];
    const search = (rooms: typeof floor.rooms) =>
      rooms.find((r) => r.name.toLowerCase().includes(m![1].trim())) ?? (type ? rooms.find((r) => r.type === type) : undefined);
    let found = search(floor.rooms);
    let foundFloor = floor;
    if (!found) {
      for (const f of p.floors) {
        found = search(f.rooms);
        if (found) {
          foundFloor = f;
          break;
        }
      }
    }
    if (!found) return { kind: "unknown", message: `I could not find a room matching "${m[1]}".`, warnings: [] };
    const amount = m[3] ? parseLength(m[3].replace(/\s+(feet|foot)$/, " ft"), p.unitSystem) : 0.5;
    if (amount == null || amount <= 0) return { kind: "unknown", message: `I could not understand the amount "${m[3]}".`, warnings: [] };
    const word = m[2];
    const dw = ["wider", "larger", "bigger"].includes(word) ? amount : word === "narrower" || word === "smaller" ? -amount : 0;
    const dd = ["deeper", "longer", "larger", "bigger"].includes(word) ? amount : word === "shallower" || word === "smaller" ? -amount : 0;
    const w = found.width + dw;
    const d = found.depth + dd;
    if (w < 0.3 || d < 0.3) return { kind: "unknown", message: "That would make the room smaller than 0.3 m.", warnings: [] };
    const roomId = found.id;
    const fId = foundFloor.id;
    const next = updateRoom(p, fId, roomId, { width: w, depth: d });
    return {
      kind: "edit",
      message: `Change "${found.name}" on ${foundFloor.name} from ${formatLength(found.width, p.unitSystem)} x ${formatLength(found.depth, p.unitSystem)} to ${formatLength(w, p.unitSystem)} x ${formatLength(d, p.unitSystem)}. Its top-left corner stays fixed.`,
      apply: (proj) => updateRoom(proj, fId, roomId, { width: w, depth: d }),
      warnings: newErrors(p, next),
    };
  }

  // ---- change plot ----
  m = text.match(/plot\s+(?:size\s+)?(?:to|as|=)\s*([\d.]+)\s*(?:by|x|×)\s*([\d.]+)\s*(feet|foot|ft|meters|meter|metres|m)?/);
  if (m) {
    const unit = m[3] ? (m[3].startsWith("f") ? "ft" : "m") : p.unitSystem === "metric" ? "m" : "ft";
    const w = parseLength(`${m[1]} ${unit}`, p.unitSystem);
    const d = parseLength(`${m[2]} ${unit}`, p.unitSystem);
    if (w == null || d == null || w <= 0 || d <= 0) return { kind: "unknown", message: "Those plot dimensions are not valid.", warnings: [] };
    const next = setPlot(p, w, d);
    return {
      kind: "edit",
      message: `Change the plot from ${formatLength(p.plot.width, p.unitSystem)} x ${formatLength(p.plot.depth, p.unitSystem)} to ${formatLength(w, p.unitSystem)} x ${formatLength(d, p.unitSystem)}. Rooms are not moved.`,
      apply: (proj) => setPlot(proj, w, d),
      warnings: newErrors(p, next),
    };
  }

  // ---- questions ----
  if (/total\s+(?:room\s+)?area|how (?:big|large)/.test(text)) {
    const lines = p.floors.map((f) => `${f.name}: ${formatArea(totalRoomArea(f), p.unitSystem)}`);
    const total = p.floors.reduce((s, f) => s + totalRoomArea(f), 0);
    return { kind: "answer", message: `${lines.join("\n")}\nAll floors: ${formatArea(total, p.unitSystem)}`, warnings: [] };
  }
  if (/flooring|floor\s*(?:tiles?|material)/.test(text) && /estimate|how much|quantity|material/.test(text)) {
    const e = buildEstimate(p);
    const fl = e.lines.find((l) => l.key === "flooring");
    if (!fl) return { kind: "unknown", message: "No flooring quantity available.", warnings: [] };
    const cost = fl.amount != null ? ` At your rate that is ${p.settings.estimate.currency}${fl.amount.toLocaleString()}.` : " Enter a flooring rate on the Estimate tab to see a cost.";
    return { kind: "answer", message: `Flooring area: ${fl.quantity.toFixed(2)} m² (${(fl.quantity * 10.7639).toFixed(0)} sq ft), with no wastage allowance.${cost}`, warnings: [] };
  }

  return {
    kind: "unknown",
    message: "I only understand a few fixed phrases. Try one of the examples below.",
    warnings: [],
  };
}
