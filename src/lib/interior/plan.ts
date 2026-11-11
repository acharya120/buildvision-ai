import type { Floor, Project, Room, RoomType } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { roomOpenings, type EdgeSide } from "../review/roomEdges";

export interface PlacedItem {
  roomId: string;
  floorId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: string;
}
export interface RoomInterior {
  roomId: string;
  floorId: string;
  roomName: string;
  type: RoomType;
  items: PlacedItem[];
  /** items from the template that did not fit */
  notPlaced: string[];
  /** furniture footprint as a share of the room floor area, % */
  crowdingPct: number;
  tips: string[];
}

interface Template {
  name: string;
  /** length along the wall it stands against (or its width when free) */
  along: number;
  /** depth out from the wall */
  out: number;
  height: number;
  color: string;
  mode: "wall" | "corner" | "centre";
  /** needs a solid wall: not placed in front of a window */
  tall?: boolean;
  /** free space needed in front of the item, m */
  front?: number;
  minArea?: number;
}

const T = (name: string, along: number, out: number, height: number, color: string, mode: Template["mode"], extra: Partial<Template> = {}): Template => ({ name, along, out, height, color, mode, ...extra });

function templates(r: Room): Template[] {
  const a = r.width * r.depth;
  switch (r.type) {
    case "bedroom":
      return [T("Bed (double)", 1.5, 2.0, 0.45, "#c7b8a6", "wall", { front: 0.6 }), T("Wardrobe", 1.5, 0.6, 2.0, "#a98967", "wall", { tall: true, front: 0.7 }), T("Study desk", 1.1, 0.55, 0.75, "#b99a74", "wall", { minArea: 12, front: 0.6 })];
    case "master-bedroom":
      return [T("Bed (king)", 1.8, 2.0, 0.45, "#c7b8a6", "wall", { front: 0.6 }), T("Wardrobe", 1.8, 0.6, 2.0, "#a98967", "wall", { tall: true, front: 0.7 }), T("Dresser", 1.0, 0.45, 0.8, "#9c7f5f", "wall", { minArea: 13 }), T("Study desk", 1.2, 0.6, 0.75, "#b99a74", "wall", { minArea: 15, front: 0.6 })];
    case "living":
      return [T("Sofa (3-seat)", 2.0, 0.9, 0.8, "#7a8fa6", "wall", { front: 0.9 }), T("TV unit", 1.4, 0.4, 0.5, "#4b4b4b", "wall", { front: 1.5 }), T("Coffee table", 1.0, 0.6, 0.4, "#8b6f4e", "centre"), T("Armchair", 0.8, 0.8, 0.8, "#8aa08c", "corner", { minArea: 16 })];
    case "dining":
      return a >= 12 ? [T("Dining table (6 seat)", 1.8, 1.0, 0.75, "#8b6f4e", "centre"), T("Crockery unit", 1.2, 0.45, 1.8, "#a98967", "wall", { tall: true, front: 0.8 })] : [T("Dining table (4 seat)", 1.2, 0.8, 0.75, "#8b6f4e", "centre")];
    case "kitchen":
      return [T("Counter with sink and hob", Math.min(3.0, Math.max(1.5, Math.max(r.width, r.depth) - 1.2)), 0.6, 0.9, "#d9d2c5", "wall", { front: 0.9 }), T("Refrigerator", 0.7, 0.7, 1.7, "#e8e8e8", "corner", { tall: true }), T("Tall storage", 0.6, 0.6, 2.0, "#cfc6b8", "wall", { tall: true, minArea: 8 })];
    case "bathroom":
      return [T("Shower tray", 0.9, 0.9, 0.08, "#dfeff2", "corner"), T("WC", 0.4, 0.65, 0.4, "#ffffff", "wall", { front: 0.5 }), T("Wash basin", 0.5, 0.4, 0.85, "#ffffff", "wall", { front: 0.5 })];
    case "toilet":
      return [T("WC", 0.4, 0.65, 0.4, "#ffffff", "wall", { front: 0.5 }), T("Wash basin", 0.5, 0.4, 0.85, "#ffffff", "wall", { front: 0.4 })];
    case "study":
    case "office":
      return [T("Desk", 1.4, 0.7, 0.75, "#b99a74", "wall", { front: 0.8 }), T("Bookshelf", 0.9, 0.35, 1.9, "#a98967", "wall", { tall: true, front: 0.6 }), T("Visitor chairs", 1.0, 0.5, 0.9, "#7a8fa6", "centre", { minArea: 12 })];
    case "utility":
      return [T("Washing machine", 0.6, 0.6, 0.85, "#e8e8e8", "wall", { front: 0.6 }), T("Wash tub", 0.6, 0.5, 0.9, "#dfeff2", "wall")];
    case "store":
      return [T("Shelving", 1.0, 0.4, 1.8, "#a98967", "wall", { tall: true, front: 0.6 })];
    case "balcony":
      return [T("Seating set", 1.2, 0.6, 0.8, "#8aa08c", "wall")];
    case "reception":
      return [T("Reception counter", 1.8, 0.6, 1.0, "#d9d2c5", "wall", { front: 1.0 }), T("Waiting sofa", 1.8, 0.8, 0.8, "#7a8fa6", "wall", { front: 0.8 })];
    case "meeting-room":
      return [T("Meeting table", Math.min(3.0, Math.max(1.8, r.width - 1.8)), 1.1, 0.75, "#8b6f4e", "centre")];
    case "ward": {
      const beds = Math.max(1, Math.min(8, Math.floor(a / 7)));
      return Array.from({ length: beds }, (_, i) => T(`Patient bed ${i + 1}`, 0.9, 2.0, 0.6, "#c9d4dc", "wall", { front: 0.8 }));
    }
    default:
      return [];
  }
}

interface Box { x: number; y: number; w: number; d: number }
const hit = (a: Box, b: Box) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.d - 1e-6 && b.y < a.y + a.d - 1e-6;
const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, d: b.d + 2 * m });

/** Places furniture by rules: against walls, away from door swings, tall pieces not in front of windows. */
export function planRoomInterior(floor: Floor, room: Room): RoomInterior {
  const base: RoomInterior = { roomId: room.id, floorId: floor.id, roomName: room.name || ROOM_TYPE_LABELS[room.type], type: room.type, items: [], notPlaced: [], crowdingPct: 0, tips: [] };
  const tpls = templates(room).filter((t) => !t.minArea || room.width * room.depth >= t.minArea);
  if (!tpls.length) {
    base.tips.push("No furniture template for this room type; nothing was placed.");
    return base;
  }
  const ops = roomOpenings(floor, room);
  const gap = 0.05;
  // door swing zones and window zones, in plan coordinates
  const keepOut: Box[] = [];
  const windows: Array<{ side: EdgeSide; from: number; to: number }> = [];
  for (const ro of ops) {
    const o = ro.opening;
    const horiz = ro.edge.side === "top" || ro.edge.side === "bottom";
    const half = o.width / 2;
    const depth = o.kind === "door" ? o.width + 0.05 : 0.0;
    if (o.kind === "door") {
      const c0 = ro.at - half - 0.05;
      const len = o.width + 0.1;
      const edgeCoord = ro.edge.side === "top" ? room.y : ro.edge.side === "bottom" ? room.y + room.depth - depth : ro.edge.side === "left" ? room.x : room.x + room.width - depth;
      keepOut.push(horiz ? { x: c0, y: edgeCoord, w: len, d: depth } : { x: edgeCoord, y: c0, w: depth, d: len });
    } else windows.push({ side: ro.edge.side, from: ro.at - half, to: ro.at + half });
  }
  const sideCount: Record<EdgeSide, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const ro of ops) sideCount[ro.edge.side]++;
  const sides = (["top", "bottom", "left", "right"] as EdgeSide[]).sort((a, b) => sideCount[a] - sideCount[b] || (b === "top" || b === "bottom" ? room.width : room.depth) - (a === "top" || a === "bottom" ? room.width : room.depth));

  const placed: Array<Box & { t: Template }> = [];
  const fronts: Box[] = [];
  const blocked = (b: Box, t: Template, clear: number): boolean => {
    if (b.x < room.x + gap - 1e-6 || b.y < room.y + gap - 1e-6 || b.x + b.w > room.x + room.width - gap + 1e-6 || b.y + b.d > room.y + room.depth - gap + 1e-6) return true;
    if (keepOut.some((k) => hit(b, k))) return true;
    if (placed.some((q) => hit(grow(b, clear), q))) return true;
    if (t.mode !== "centre" && fronts.some((f) => hit(b, f))) return true;
    if (t.tall) {
      for (const w of windows) {
        const zone: Box = w.side === "top" ? { x: w.from, y: room.y, w: w.to - w.from, d: 0.3 } : w.side === "bottom" ? { x: w.from, y: room.y + room.depth - 0.3, w: w.to - w.from, d: 0.3 } : w.side === "left" ? { x: room.x, y: w.from, w: 0.3, d: w.to - w.from } : { x: room.x + room.width - 0.3, y: w.from, w: 0.3, d: w.to - w.from };
        if (hit(b, zone)) return true;
      }
    }
    return false;
  };
  const boxAgainst = (side: EdgeSide, t: Template, pos: number): Box => {
    // pos = start of the item along the wall in plan coordinates
    if (side === "top") return { x: pos, y: room.y + gap, w: t.along, d: t.out };
    if (side === "bottom") return { x: pos, y: room.y + room.depth - gap - t.out, w: t.along, d: t.out };
    if (side === "left") return { x: room.x + gap, y: pos, w: t.out, d: t.along };
    return { x: room.x + room.width - gap - t.out, y: pos, w: t.out, d: t.along };
  };
  const frontZone = (side: EdgeSide, b: Box, t: Template): Box | null => {
    const f = t.front ?? 0;
    if (!f) return null;
    return side === "top" ? { x: b.x, y: b.y + b.d, w: b.w, d: f } : side === "bottom" ? { x: b.x, y: b.y - f, w: b.w, d: f } : side === "left" ? { x: b.x + b.w, y: b.y, w: f, d: b.d } : { x: b.x - f, y: b.y, w: f, d: b.d };
  };

  for (const t of tpls) {
    let found: { b: Box; side?: EdgeSide } | null = null;
    if (t.mode === "centre") {
      const cx = room.x + (room.width - t.along) / 2;
      const cy = room.y + (room.depth - t.out) / 2;
      const b = { x: cx, y: cy, w: t.along, d: t.out };
      if (!blocked(b, t, 0.3)) found = { b };
      else {
        const b2 = { x: room.x + (room.width - t.out) / 2, y: room.y + (room.depth - t.along) / 2, w: t.out, d: t.along };
        if (!blocked(b2, t, 0.3)) found = { b: b2 };
      }
    } else {
      outer: for (const side of sides) {
        const horiz = side === "top" || side === "bottom";
        const lo = horiz ? room.x + gap : room.y + gap;
        const hi = (horiz ? room.x + room.width : room.y + room.depth) - gap - t.along;
        if (hi < lo - 1e-6) continue;
        const starts: number[] = t.mode === "corner" ? [lo, hi] : [(lo + hi) / 2];
        for (let s = lo; s <= hi + 1e-6; s += 0.15) starts.push(s);
        for (const s of starts) {
          const b = boxAgainst(side, t, s);
          if (blocked(b, t, t.mode === "corner" ? 0.05 : 0.1)) continue;
          const fz = frontZone(side, b, t);
          if (fz && placed.some((q) => hit(fz, q) && q.t.mode !== "centre")) continue;
          if (fz) fronts.push(fz);
          found = { b, side };
          break outer;
        }
      }
    }
    if (found) placed.push({ ...found.b, t });
    else base.notPlaced.push(t.name);
  }

  base.items = placed.map((q) => ({ roomId: room.id, floorId: floor.id, name: q.t.name, x: q.x, y: q.y, width: q.w, depth: q.d, height: q.t.height, color: q.t.color }));
  const used = base.items.reduce((s, i) => s + i.width * i.depth, 0);
  base.crowdingPct = Math.round((used / (room.width * room.depth)) * 100);
  if (base.notPlaced.length) base.tips.push(`Did not fit with clear walking space: ${base.notPlaced.join(", ")}. Choose smaller pieces, built-in storage or enlarge the room.`);
  if (base.crowdingPct > 45) base.tips.push(`Furniture covers ${base.crowdingPct}% of the floor, which will feel tight. Aim for under about 40% in living areas.`);
  const tip = ROOM_TIPS[room.type];
  if (tip) base.tips.push(tip);
  return base;
}

const ROOM_TIPS: Partial<Record<RoomType, string>> = {
  bedroom: "Keep the bed head on a solid wall, not under a window, and use warm (about 2700 K) lights.",
  "master-bedroom": "Keep the bed head on a solid wall; put the wardrobe on the wall nearest the dressing/bath side.",
  living: "Face seating towards the focal wall (TV or window view) and keep a clear 0.9 m path to doors.",
  dining: "Leave at least 0.9 m behind each chair so people can sit and pass.",
  kitchen: "Keep sink, hob and fridge close together (the work triangle) and counters 0.9 m high.",
  bathroom: "Keep wet (shower) and dry (basin) zones apart and use anti-slip tiles on the floor.",
  study: "Place the desk side-on to the window to avoid glare on the screen.",
};

export function planFloorInterior(floor: Floor): RoomInterior[] {
  return floor.rooms.filter(isValidRect).map((r) => planRoomInterior(floor, r));
}
export function planProjectInterior(p: Project): RoomInterior[] {
  return p.floors.flatMap(planFloorInterior);
}

export interface FurnitureRow { floor: string; room: string; item: string; size: string; qty: number }
/** Furniture schedule: one row per item type per room. */
export function furnitureSchedule(p: Project): FurnitureRow[] {
  const rows: FurnitureRow[] = [];
  for (const f of p.floors) {
    for (const ri of planFloorInterior(f)) {
      const cnt = new Map<string, { n: number; w: number; d: number }>();
      for (const i of ri.items) {
        const k = `${i.name}|${i.width.toFixed(2)}x${i.depth.toFixed(2)}`;
        const c = cnt.get(k);
        if (c) c.n++;
        else cnt.set(k, { n: 1, w: Math.max(i.width, i.depth), d: Math.min(i.width, i.depth) });
      }
      for (const [k, c] of cnt) rows.push({ floor: f.name, room: ri.roomName, item: k.split("|")[0], size: `${c.w.toFixed(2)} x ${c.d.toFixed(2)} m`, qty: c.n });
    }
  }
  return rows;
}

export function furnitureCsv(p: Project): string {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  return ["Floor,Room,Item,Size (length x depth),Qty", ...furnitureSchedule(p).map((r) => [r.floor, r.room, r.item, r.size, r.qty].map(q).join(","))].join("\n");
}
