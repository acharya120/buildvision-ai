import type { Floor, Project, Room, RoomType } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { roomOpenings } from "../review/roomEdges";

export type PointKind = "light" | "fan" | "socket" | "power15" | "switch" | "ac" | "exhaust" | "geyser";
export interface ElecPoint { kind: PointKind; x: number; y: number; roomId: string; floorId: string }
export type FixtureKind = "wc" | "basin" | "shower" | "sink" | "washer";
export interface Fixture { kind: FixtureKind; x: number; y: number; roomId: string; floorId: string }
export interface PipeRun { floorId: string; kind: "supply" | "drain"; x1: number; y1: number; x2: number; y2: number; length: number }
export interface ServicesOptions { acInBedrooms: boolean; people: number; litresPerHead: number }
export const DEFAULT_SERVICES: ServicesOptions = { acInBedrooms: false, people: 0, litresPerHead: 135 };

/** Rated watts per point: placeholder assumptions to size the connected load, not a design. */
export const POINT_WATTS: Record<PointKind, number> = { light: 15, fan: 75, socket: 100, power15: 1000, switch: 0, ac: 1500, exhaust: 40, geyser: 2000 };
export const POINT_LABELS: Record<PointKind, string> = { light: "Light point", fan: "Ceiling fan", socket: "5 A socket", power15: "15 A power socket", switch: "Switch board", ac: "AC point", exhaust: "Exhaust fan", geyser: "Geyser point" };

const FAN_ROOMS = new Set<RoomType>(["living", "bedroom", "master-bedroom", "dining", "study", "office", "meeting-room", "reception", "hall", "classroom", "ward"]);
const SOCKETS: Partial<Record<RoomType, number>> = { living: 5, bedroom: 4, "master-bedroom": 5, kitchen: 4, dining: 2, study: 4, office: 4, utility: 2, bathroom: 1, toilet: 0, store: 1, lobby: 1, reception: 3 };
const SKIP = new Set<RoomType>(["staircase", "lift", "corridor", "parking"]);
const WET = new Set<RoomType>(["bathroom", "toilet", "kitchen", "utility"]);

function grid(r: Room, n: number): Array<{ x: number; y: number }> {
  const cols = Math.max(1, Math.round(Math.sqrt((n * r.width) / r.depth)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const pts: Array<{ x: number; y: number }> = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (pts.length < n) pts.push({ x: r.x + ((i + 0.5) * r.width) / cols, y: r.y + ((j + 0.5) * r.depth) / rows });
  return pts;
}

export function electricalFloor(floor: Floor, opts: ServicesOptions): ElecPoint[] {
  const pts: ElecPoint[] = [];
  for (const r of floor.rooms.filter(isValidRect)) {
    if (SKIP.has(r.type)) continue;
    const area = r.width * r.depth;
    const add = (kind: PointKind, x: number, y: number) => pts.push({ kind, x, y, roomId: r.id, floorId: floor.id });
    const nLight = Math.max(1, Math.ceil(area / 9));
    const nFan = FAN_ROOMS.has(r.type) ? Math.max(1, Math.ceil(area / 14)) : 0;
    const lightPts = grid(r, nLight + nFan);
    lightPts.forEach((q, i) => (i < nFan ? add("fan", q.x, q.y) : add("light", q.x, q.y)));
    // switch boards inside the room beside each door
    const doors = roomOpenings(floor, r).filter((o) => o.opening.kind === "door");
    const doorSpots: Array<{ x: number; y: number }> = [];
    for (const d of doors) {
      const e = d.edge;
      const off = d.opening.width / 2 + 0.3;
      const horiz = e.side === "top" || e.side === "bottom";
      const along = Math.min(Math.max(d.at + off, (horiz ? r.x : r.y) + 0.2), (horiz ? r.x + r.width : r.y + r.depth) - 0.2);
      const x = horiz ? along : e.side === "left" ? r.x + 0.15 : r.x + r.width - 0.15;
      const y = horiz ? (e.side === "top" ? r.y + 0.15 : r.y + r.depth - 0.15) : along;
      doorSpots.push({ x, y });
      add("switch", x, y);
    }
    if (!doors.length) add("switch", r.x + 0.2, r.y + 0.2);
    // sockets spread along the walls, keeping clear of doors
    const nSock = SOCKETS[r.type] ?? 2;
    const per = 2 * (r.width + r.depth);
    for (let i = 0, placed = 0, tries = 0; placed < nSock && tries < nSock * 4; i++, tries++) {
      const t = (((i + 0.5) / nSock) * per + Math.floor(i / nSock) * 0.4) % per;
      let x: number, y: number;
      if (t < r.width) { x = r.x + t; y = r.y + 0.15; }
      else if (t < r.width + r.depth) { x = r.x + r.width - 0.15; y = r.y + (t - r.width); }
      else if (t < 2 * r.width + r.depth) { x = r.x + r.width - (t - r.width - r.depth); y = r.y + r.depth - 0.15; }
      else { x = r.x + 0.15; y = r.y + r.depth - (t - 2 * r.width - r.depth); }
      if (doorSpots.some((d) => Math.hypot(d.x - x, d.y - y) < 0.7)) continue;
      add(r.type === "kitchen" && placed < 2 ? "power15" : "socket", x, y);
      placed++;
    }
    if (opts.acInBedrooms && (r.type === "bedroom" || r.type === "master-bedroom")) add("ac", r.x + r.width / 2, r.y + 0.3);
    if (r.type === "bathroom") add("geyser", r.x + r.width - 0.3, r.y + 0.3);
    if (r.type === "bathroom" || r.type === "toilet" || r.type === "kitchen") add("exhaust", r.x + r.width - 0.35, r.y + r.depth / 2);
  }
  return pts;
}

export function plumbingFloor(floor: Floor): { fixtures: Fixture[]; stack: { x: number; y: number } | null; runs: PipeRun[] } {
  const fixtures: Fixture[] = [];
  const wet = floor.rooms.filter((r) => isValidRect(r) && WET.has(r.type));
  for (const r of wet) {
    const add = (kind: FixtureKind, x: number, y: number) => fixtures.push({ kind, x, y, roomId: r.id, floorId: floor.id });
    if (r.type === "bathroom") { add("wc", r.x + r.width - 0.3, r.y + 0.4); add("basin", r.x + 0.35, r.y + 0.3); add("shower", r.x + 0.5, r.y + r.depth - 0.5); }
    else if (r.type === "toilet") { add("wc", r.x + r.width / 2, r.y + 0.4); add("basin", r.x + 0.35, r.y + r.depth - 0.3); }
    else if (r.type === "kitchen") add("sink", r.x + r.width / 2, r.y + 0.35);
    else add("washer", r.x + 0.4, r.y + 0.4);
  }
  if (!wet.length) return { fixtures, stack: null, runs: [] };
  const cx = wet.reduce((s, r) => s + r.x + r.width / 2, 0) / wet.length;
  const sy = wet.reduce((s, r) => s + r.y + r.depth / 2, 0) / wet.length;
  const stack = { x: cx, y: sy };
  const runs: PipeRun[] = [];
  for (const r of wet) {
    const tx = r.x + r.width / 2, ty = r.y + r.depth / 2;
    for (const kind of ["supply", "drain"] as const) {
      const off = kind === "supply" ? -0.08 : 0.08;
      // two straight legs (horizontal then vertical), as pipes would be run
      const legs = [
        { x1: stack.x + off, y1: stack.y + off, x2: tx + off, y2: stack.y + off },
        { x1: tx + off, y1: stack.y + off, x2: tx + off, y2: ty + off },
      ];
      for (const l of legs) { const length = Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1); if (length > 0.01) runs.push({ floorId: floor.id, kind, ...l, length }); }
    }
  }
  return { fixtures, stack, runs };
}

export interface ServicesSummary {
  points: Record<PointKind, number>;
  connectedKw: number;
  fixtures: Record<FixtureKind, number>;
  supplyPipeM: number;
  drainPipeM: number;
  people: number;
  dailyLitres: number;
  tankLitres: number;
  stacks: number;
}
const sleeps = (p: Project) => p.floors.flatMap((f) => f.rooms).reduce((s, r) => s + (r.type === "master-bedroom" || r.type === "bedroom" ? 2 : 0), 0);

export function servicesSummary(p: Project, opts: ServicesOptions): ServicesSummary {
  const points = Object.fromEntries((Object.keys(POINT_WATTS) as PointKind[]).map((k) => [k, 0])) as Record<PointKind, number>;
  const fixtures: Record<FixtureKind, number> = { wc: 0, basin: 0, shower: 0, sink: 0, washer: 0 };
  let supply = 0, drain = 0, stacks = 0;
  for (const f of p.floors) {
    electricalFloor(f, opts).forEach((e) => points[e.kind]++);
    const pl = plumbingFloor(f);
    pl.fixtures.forEach((x) => fixtures[x.kind]++);
    if (pl.stack) stacks++;
    pl.runs.forEach((r) => (r.kind === "supply" ? (supply += r.length) : (drain += r.length)));
  }
  const watts = (Object.keys(points) as PointKind[]).reduce((s, k) => s + points[k] * POINT_WATTS[k], 0);
  const people = opts.people > 0 ? opts.people : Math.max(1, sleeps(p));
  const dailyLitres = people * opts.litresPerHead;
  return { points, connectedKw: Math.round(watts) / 1000, fixtures, supplyPipeM: Math.round(supply * 10) / 10, drainPipeM: Math.round(drain * 10) / 10, people, dailyLitres, tankLitres: Math.ceil(dailyLitres / 100) * 100, stacks };
}
export { ROOM_TYPE_LABELS };
