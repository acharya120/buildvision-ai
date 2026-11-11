import type { Project, Room } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { diffLines, wallLines } from "./clash";

export interface RoomChange { floorName: string; roomId: string; name: string; kind: "new" | "demolished" | "modified"; detail: string; room: Room }
export interface WallChange { floorName: string; x1: number; y1: number; x2: number; y2: number; length: number; thickness: number }
export interface RenovationDiff {
  rooms: RoomChange[];
  removedWalls: WallChange[]; addedWalls: WallChange[];
  removedWallM: number; addedWallM: number; demolishedM3: number; newM3: number;
  openingsRemoved: number; openingsAdded: number;
}
const same = (a: number, b: number) => Math.abs(a - b) < 0.05;
const rn = (r: Room) => r.name || ROOM_TYPE_LABELS[r.type];

/** Compare an "existing building" baseline with the current design. Quantities are geometric (length x height x thickness). */
export function renovationDiff(base: Project, cur: Project): RenovationDiff {
  const rooms: RoomChange[] = [];
  const removedWalls: WallChange[] = [], addedWalls: WallChange[] = [];
  let dem = 0, neu = 0, oR = 0, oA = 0;
  const floorNames = new Set([...base.floors, ...cur.floors].map((f) => f.name));
  for (const name of floorNames) {
    const b = base.floors.find((f) => f.name === name), c = cur.floors.find((f) => f.name === name);
    const br = (b?.rooms ?? []).filter(isValidRect), cr = (c?.rooms ?? []).filter(isValidRect);
    for (const r of cr) {
      const o = br.find((q) => q.id === r.id);
      if (!o) rooms.push({ floorName: name, roomId: r.id, name: rn(r), kind: "new", detail: `New ${(r.width * r.depth).toFixed(1)} m² room`, room: r });
      else {
        const parts: string[] = [];
        if (!same(o.x, r.x) || !same(o.y, r.y)) parts.push("moved");
        if (!same(o.width, r.width) || !same(o.depth, r.depth)) parts.push(`resized ${(o.width * o.depth).toFixed(1)} → ${(r.width * r.depth).toFixed(1)} m²`);
        if (o.type !== r.type) parts.push(`${ROOM_TYPE_LABELS[o.type]} → ${ROOM_TYPE_LABELS[r.type]}`);
        if (parts.length) rooms.push({ floorName: name, roomId: r.id, name: rn(r), kind: "modified", detail: parts.join(", "), room: r });
      }
    }
    for (const r of br) if (!cr.some((q) => q.id === r.id)) rooms.push({ floorName: name, roomId: r.id, name: rn(r), kind: "demolished", detail: `Remove ${(r.width * r.depth).toFixed(1)} m² room`, room: r });
    const h = c?.height ?? b?.height ?? 3;
    const bl = b ? wallLines(b) : new Map(), cl = c ? wallLines(c) : new Map();
    const thick = (f: typeof b) => f?.walls[0]?.thickness ?? 0.23;
    for (const d of diffLines(bl, cl)) {
      const horiz = d.key[0] === "h", fixed = Number(d.key.slice(2));
      const len = d.iv[1] - d.iv[0], t = thick(b);
      removedWalls.push({ floorName: name, x1: horiz ? d.iv[0] : fixed, y1: horiz ? fixed : d.iv[0], x2: horiz ? d.iv[1] : fixed, y2: horiz ? fixed : d.iv[1], length: len, thickness: t });
      dem += len * h * t;
    }
    for (const d of diffLines(cl, bl)) {
      const horiz = d.key[0] === "h", fixed = Number(d.key.slice(2));
      const len = d.iv[1] - d.iv[0], t = thick(c);
      addedWalls.push({ floorName: name, x1: horiz ? d.iv[0] : fixed, y1: horiz ? fixed : d.iv[0], x2: horiz ? d.iv[1] : fixed, y2: horiz ? fixed : d.iv[1], length: len, thickness: t });
      neu += len * h * t;
    }
    const key = (f: typeof b, o: { wallId: string; offset: number; width: number; kind: string }) => { const w = f?.walls.find((q) => q.id === o.wallId); if (!w) return ""; const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1; const t = o.offset + o.width / 2; return `${o.kind}:${Math.round((w.x1 + ((w.x2 - w.x1) / len) * t) * 10)}:${Math.round((w.y1 + ((w.y2 - w.y1) / len) * t) * 10)}`; };
    const bo = new Set((b?.openings ?? []).map((o) => key(b, o))), co = new Set((c?.openings ?? []).map((o) => key(c, o)));
    oR += [...bo].filter((k) => k && !co.has(k)).length;
    oA += [...co].filter((k) => k && !bo.has(k)).length;
  }
  const r2 = (n: number) => Math.round(n * 1000) / 1000;
  return { rooms, removedWalls, addedWalls, removedWallM: r2(removedWalls.reduce((s, w) => s + w.length, 0)), addedWallM: r2(addedWalls.reduce((s, w) => s + w.length, 0)), demolishedM3: r2(dem), newM3: r2(neu), openingsRemoved: oR, openingsAdded: oA };
}

export interface RenovationCost { lines: Array<{ key: string; name: string; qty: number; unit: string; rate: number | null; amount: number | null }>; total: number; unrated: number }
export const BULKING = 1.3;
/** Demolition debris bulks up when broken; the factor is editable. Costs use ONLY the rates you enter. */
export function renovationCost(d: RenovationDiff, rates: Record<string, number>, bulking = BULKING): RenovationCost {
  const mk = (key: string, name: string, qty: number, unit: string) => { const rate = rates[key] != null && rates[key] >= 0 ? rates[key] : null; return { key, name, qty: Math.round(qty * 1000) / 1000, unit, rate, amount: rate == null ? null : Math.round(qty * rate * 100) / 100 }; };
  const lines = [mk("ren-demolish", "Demolition of masonry", d.demolishedM3, "m³"), mk("ren-debris", "Debris removal (bulked)", d.demolishedM3 * bulking, "m³"), mk("ren-wall", "New masonry", d.newM3, "m³"), mk("ren-opening", "New openings cut / fitted", d.openingsAdded, "nos")];
  return { lines, total: lines.reduce((s, l) => s + (l.amount ?? 0), 0), unrated: lines.filter((l) => l.qty > 0 && l.rate == null).length };
}
