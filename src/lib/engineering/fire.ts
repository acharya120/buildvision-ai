import type { Floor, Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { openingCentre, roomOpenings } from "../review/roomEdges";
import type { Check } from "../analysis/compliance";

export interface FireRules { maxTravel: number | null; minExits: number | null; exitsAboveArea: number | null; minStairWidth: number | null; minCorridor: number | null; areaPerExtinguisher: number | null }
export const EMPTY_FIRE: FireRules = { maxTravel: null, minExits: null, exitsAboveArea: null, minStairWidth: null, minCorridor: null, areaPerExtinguisher: null };
/** Commonly cited example values. Fire codes differ by country, occupancy and height: use your local code. */
export const EXAMPLE_FIRE: FireRules = { maxTravel: 22.5, minExits: 2, exitsAboveArea: 200, minStairWidth: 1.0, minCorridor: 1.0, areaPerExtinguisher: 200 };

type Pt = { x: number; y: number };
export interface FireRoom {
  /** true when the room has no door drawn at all, so no route can be traced */
  noDoor?: boolean; roomId: string; name: string; distance: number | null; path: Pt[] }
export interface FireFloor { floorId: string; floorName: string; exits: Pt[]; rooms: FireRoom[]; maxDistance: number; extinguishers: number; smokeDetectors: number }

const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function fireFloor(floor: Floor, isGround: boolean, rules: FireRules): FireFloor {
  const rooms = floor.rooms.filter(isValidRect);
  const centre = (id: string): Pt => { const r = rooms.find((q) => q.id === id)!; return { x: r.x + r.width / 2, y: r.y + r.depth / 2 }; };
  // nodes: room centres and door points; edges: room centre <-> its doors. Staircase rooms are never walked through.
  const nodes: Pt[] = [];
  const idx = new Map<string, number>();
  const node = (key: string, pt: Pt) => { if (!idx.has(key)) { idx.set(key, nodes.length); nodes.push(pt); } return idx.get(key)!; };
  const edges: Array<Array<[number, number]>> = [];
  const link = (a: number, b: number) => { const w = d(nodes[a], nodes[b]); (edges[a] ||= []).push([b, w]); (edges[b] ||= []).push([a, w]); };
  const sources: number[] = [];
  const exits: Pt[] = [];
  const doorsByRoom = new Map<string, Array<{ id: string; pt: Pt; exterior: boolean }>>();
  for (const r of rooms) doorsByRoom.set(r.id, roomOpenings(floor, r).filter((o) => o.opening.kind === "door").map((o) => ({ id: o.opening.id, pt: openingCentre(o.edge.wall, o.opening), exterior: o.edge.exterior })));
  const count = new Map<string, number>();
  for (const list of doorsByRoom.values()) for (const x of list) count.set(x.id, (count.get(x.id) ?? 0) + 1);
  for (const r of rooms) {
    const isStair = r.type === "staircase";
    const rn = node(`r:${r.id}`, centre(r.id));
    for (const dr of doorsByRoom.get(r.id) ?? []) {
      const dn = node(`d:${dr.id}`, dr.pt);
      if (!isStair) link(rn, dn);
      const outside = (count.get(dr.id) ?? 0) === 1 && dr.exterior;
      if (outside && isGround && !isStair) { if (!sources.includes(dn)) { sources.push(dn); exits.push(dr.pt); } }
      if (isStair && !isGround && !sources.includes(dn)) { sources.push(dn); exits.push(dr.pt); }
    }
  }
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
  sources.forEach((s) => (dist[s] = 0));
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const [v, w] of edges[u] ?? []) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const out: FireRoom[] = [];
  for (const r of rooms) {
    if (r.type === "staircase" && !isGround) { out.push({ roomId: r.id, name: r.name || ROOM_TYPE_LABELS[r.type], distance: 0, path: [] }); continue; }
    const i = idx.get(`r:${r.id}`)!;
    if (!isFinite(dist[i])) { out.push({ roomId: r.id, name: r.name || ROOM_TYPE_LABELS[r.type], distance: null, path: [], noDoor: (doorsByRoom.get(r.id) ?? []).length === 0 }); continue; }
    const path: Pt[] = [];
    for (let k = i; k >= 0; k = prev[k]) path.push(nodes[k]);
    out.push({ roomId: r.id, name: r.name || ROOM_TYPE_LABELS[r.type], distance: dist[i], path });
  }
  const area = rooms.reduce((s, r) => s + r.width * r.depth, 0);
  const per = rules.areaPerExtinguisher ?? 200;
  return {
    floorId: floor.id, floorName: floor.name, exits, rooms: out,
    maxDistance: Math.max(0, ...out.map((q) => q.distance ?? 0)),
    extinguishers: rooms.length ? Math.max(1, Math.ceil(area / per)) + (rooms.some((r) => r.type === "kitchen") ? 1 : 0) : 0,
    smokeDetectors: rooms.filter((r) => !["bathroom", "toilet", "staircase", "lift"].includes(r.type)).length,
  };
}

export function fireAnalysis(p: Project, rules: FireRules): { floors: FireFloor[]; checks: Check[] } {
  const floors = p.floors.map((f, i) => fireFloor(f, i === 0, rules));
  const checks: Check[] = [];
  let n = 0;
  const add = (group: string, label: string, required: string, actual: string, status: Check["status"]) => checks.push({ id: `f${++n}`, group, label, required, actual, status });
  floors.forEach((ff, i) => {
    const f = p.floors[i];
    const area = f.rooms.filter(isValidRect).reduce((s, r) => s + r.width * r.depth, 0);
    if (!f.rooms.length) return;
    for (const r of ff.rooms) {
      if (r.distance == null) add("Escape routes", `${r.name} (${ff.floorName}) has a route to an exit`, "a connected route", r.noDoor ? "no door drawn in this room, so no route can be traced" : "doors do not connect to an exit", "fail");
      else if (rules.maxTravel != null && r.path.length) add("Travel distance", `${r.name} (${ff.floorName})`, `at most ${rules.maxTravel} m`, `${r.distance.toFixed(1)} m`, r.distance <= rules.maxTravel + 1e-6 ? "pass" : "fail");
    }
    if (rules.minExits != null && rules.exitsAboveArea != null && area >= rules.exitsAboveArea) add("Exits", `Exits on ${ff.floorName} (area ${area.toFixed(0)} m²)`, `at least ${rules.minExits}`, String(ff.exits.length), ff.exits.length >= rules.minExits ? "pass" : "fail");
    else if (!ff.exits.length) add("Exits", `Exits on ${ff.floorName}`, "at least 1", "0", "fail");
    if (rules.minStairWidth != null) for (const r of f.rooms.filter((q) => q.type === "staircase" && isValidRect(q))) add("Stairs", `Staircase narrow side (${ff.floorName})`, `at least ${rules.minStairWidth} m`, `${Math.min(r.width, r.depth).toFixed(2)} m`, Math.min(r.width, r.depth) + 1e-6 >= rules.minStairWidth ? "pass" : "fail");
    if (rules.minCorridor != null) for (const r of f.rooms.filter((q) => q.type === "corridor" && isValidRect(q))) add("Corridors", `Corridor width (${ff.floorName})`, `at least ${rules.minCorridor} m`, `${Math.min(r.width, r.depth).toFixed(2)} m`, Math.min(r.width, r.depth) + 1e-6 >= rules.minCorridor ? "pass" : "fail");
  });
  return { floors, checks };
}
