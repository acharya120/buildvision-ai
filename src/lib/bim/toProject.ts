import type { Project, RoomType } from "../model/types";
import { ROOM_TYPES, makeRoom } from "../model/defaults";
import { createProject, generateWalls, mapFloor, addRoom } from "../model/ops";

export interface NewFloor { name: string; height: number | null; rooms: Array<{ name: string; type: string; x: number; y: number; width: number; depth: number }> }

/** Map free text (IFC LongName, room label) to one of the app's room types. */
export function guessRoomType(text: string): RoomType {
  const t = text.toLowerCase().trim();
  if ((ROOM_TYPES as string[]).includes(t)) return t as RoomType;
  const rules: Array<[RegExp, RoomType]> = [[/master/, "master-bedroom"], [/bed/, "bedroom"], [/kitchen/, "kitchen"], [/dining/, "dining"], [/bath|wc|toilet|lavatory/, "bathroom"], [/living|lounge|hall|drawing/, "living"], [/stair/, "staircase"], [/park|garage/, "parking"]];
  for (const [re, ty] of rules) if (re.test(t) && (ROOM_TYPES as string[]).includes(ty)) return ty;
  return "custom";
}

/** Build a new project from rectangles. The plot is the rooms' extent plus a margin, walls are generated from the room edges. Rooms with non-positive size are skipped. */
export function projectFromFloors(name: string, floors: NewFloor[], margin = 1): { project: Project; skipped: number } | { error: string } {
  const good = floors.map((f) => ({ ...f, rooms: f.rooms.filter((r) => [r.x, r.y, r.width, r.depth].every(isFinite) && r.width > 0.3 && r.depth > 0.3) }));
  const skipped = floors.reduce((s, f, i) => s + f.rooms.length - good[i].rooms.length, 0);
  const all = good.flatMap((f) => f.rooms);
  if (!all.length) return { error: "No usable rooms to create a project from." };
  const w = Math.max(...all.map((r) => r.x + r.width)) + margin, d = Math.max(...all.map((r) => r.y + r.depth)) + margin;
  let p = createProject({ name: name.trim().slice(0, 80) || "Imported project", plotWidth: Math.min(5000, Math.max(3, Math.ceil(w))), plotDepth: Math.min(5000, Math.max(3, Math.ceil(d))), unitSystem: "metric", buildingType: good.length > 1 ? "duplex" : "single-floor", floors: Math.min(good.length, 20) });
  good.slice(0, 20).forEach((f, i) => {
    const fid = p.floors[i].id;
    p = mapFloor(p, fid, (fl) => ({ ...fl, name: f.name.slice(0, 40) || fl.name, height: f.height && f.height >= 2 && f.height <= 8 ? f.height : fl.height }));
    for (const r of f.rooms) { const ty = guessRoomType(r.type || r.name); p = addRoom(p, fid, makeRoom(ty, r.x + margin / 2, r.y + margin / 2, { width: r.width, depth: r.depth }, r.name.slice(0, 40) || undefined)); }
    p = generateWalls(p, fid);
  });
  return { project: p, skipped };
}
