import type { Floor, Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_COLORS } from "../model/defaults";
import { esc, niceScaleBar } from "../export/svg";
import { frameSheet, INK, f2, tableSvg, type Body } from "../studio/frame";
import { buildingBox } from "../analysis/compass";
import { fireFloor, type FireRules } from "./fire";
import { detectClashes, type Clash } from "./clash";
import type { RenovationDiff } from "./renovation";
import { PRELIM } from "./prelim";

const PAD = 60;
function mapper(p: Project, floors: Floor[]) {
  const rs = floors.flatMap((f) => f.rooms.filter(isValidRect));
  const b = buildingBox({ ...p, floors });
  const x0 = b ? b.x0 : 0, x1 = b ? b.x1 : p.plot.width, y0 = b ? b.y0 : 0, y1 = b ? b.y1 : p.plot.depth;
  void rs;
  const s = Math.max(3, Math.min(70, 760 / Math.max(1, x1 - x0), 600 / Math.max(1, y1 - y0)));
  return { s, X: (m: number) => f2(PAD + (m - x0) * s), Y: (m: number) => f2(PAD + (m - y0) * s), w: (x1 - x0) * s + PAD * 2, h: (y1 - y0) * s + PAD * 2 + 16 };
}
const base = (floor: Floor, v: ReturnType<typeof mapper>, fill: (r: Floor["rooms"][number]) => string) =>
  floor.rooms.filter(isValidRect).map((r) => `<rect x="${v.X(r.x)}" y="${v.Y(r.y)}" width="${f2(r.width * v.s)}" height="${f2(r.depth * v.s)}" fill="${fill(r)}" stroke="none"/>`).join("") +
  floor.walls.map((w) => `<line x1="${v.X(w.x1)}" y1="${v.Y(w.y1)}" x2="${v.X(w.x2)}" y2="${v.Y(w.y2)}" stroke="${INK}" stroke-width="${f2(Math.max(1.4, w.thickness * v.s))}"/>`).join("");
const north = (p: Project, v: { w: number }) => `<g transform="translate(${f2(v.w - 40)} 44) rotate(${p.northAngle ?? 0})"><circle r="20" fill="#fff" stroke="${INK}"/><path d="M0 -15 L6 9 L0 4 L-6 9 Z" fill="${INK}"/><text y="-24" font-size="11" font-weight="bold" text-anchor="middle" fill="${INK}">N</text></g>`;
const scale = (p: Project, v: { s: number; h: number }) => { const sb = niceScaleBar(Math.max(p.plot.width, p.plot.depth), p.unitSystem); const y = v.h - 14; return `<line x1="${PAD}" y1="${y}" x2="${f2(PAD + sb.meters * v.s)}" y2="${y}" stroke="${INK}" stroke-width="2"/><text x="${f2(PAD + (sb.meters * v.s) / 2)}" y="${y - 4}" font-size="9" text-anchor="middle" fill="${INK}">${esc(sb.label)}</text>`; };

export function fireSvg(p: Project, floorIndex: number, rules: FireRules): string {
  const floor = p.floors[floorIndex] ?? p.floors[0];
  const v = mapper(p, [floor]);
  const ff = fireFloor(floor, floorIndex === 0, rules);
  const o: string[] = [base(floor, v, (r) => ROOM_COLORS[r.type] + "88")];
  for (const r of ff.rooms) {
    if (r.path.length < 2) continue;
    const pts = r.path.map((q) => `${v.X(q.x)},${v.Y(q.y)}`).join(" ");
    const bad = rules.maxTravel != null && r.distance != null && r.distance > rules.maxTravel;
    o.push(`<polyline points="${pts}" fill="none" stroke="${bad ? "#dc2626" : "#16a34a"}" stroke-width="2" stroke-dasharray="6 3"/>`);
    const s = r.path[0];
    o.push(`<circle cx="${v.X(s.x)}" cy="${v.Y(s.y)}" r="3.5" fill="${bad ? "#dc2626" : "#16a34a"}"/><text x="${v.X(s.x) + 6}" y="${v.Y(s.y) - 5}" font-size="8.5" fill="${INK}">${r.distance!.toFixed(1)} m</text>`);
  }
  for (const e of ff.exits) o.push(`<rect x="${v.X(e.x) - 9}" y="${v.Y(e.y) - 9}" width="18" height="18" rx="3" fill="#16a34a" stroke="#fff" stroke-width="1.5"/><text x="${v.X(e.x)}" y="${v.Y(e.y) + 3}" font-size="8" font-weight="bold" text-anchor="middle" fill="#fff">EXIT</text>`);
  // extinguishers: one near each exit, remaining spread by rooms
  const rooms = floor.rooms.filter(isValidRect).filter((r) => !["bathroom", "toilet", "staircase", "lift"].includes(r.type));
  rooms.slice(0, ff.extinguishers).forEach((r) => o.push(`<rect x="${v.X(r.x) + 5}" y="${v.Y(r.y + r.depth) - 15}" width="8" height="10" rx="2" fill="#dc2626"/>`));
  o.push(north(p, v), scale(p, v));
  const t: Body = tableSvg("Summary", ["Item", "Value"], [["Exits", String(ff.exits.length)], ["Longest route", `${ff.maxDistance.toFixed(1)} m`], ["Suggested extinguishers", String(ff.extinguishers)], ["Smoke detectors (rooms)", String(ff.smokeDetectors)], ["Travel limit entered", rules.maxTravel == null ? "not set" : `${rules.maxTravel} m`]], [200, 100]);
  const leg = `<line x1="0" y1="6" x2="26" y2="6" stroke="#16a34a" stroke-width="2" stroke-dasharray="6 3"/><text x="32" y="9" font-size="9">Escape route (within limit)</text><line x1="0" y1="22" x2="26" y2="22" stroke="#dc2626" stroke-width="2" stroke-dasharray="6 3"/><text x="32" y="25" font-size="9">Route longer than the limit</text><rect x="0" y="32" width="8" height="10" fill="#dc2626"/><text x="32" y="41" font-size="9">Extinguisher (suggested)</text>`;
  return frameSheet(p, `Fire safety and evacuation - ${floor.name}`, "PRELIMINARY - not certified", { svg: o.join(""), w: v.w, h: v.h }, [t, { svg: leg, w: 200, h: 48 }], [PRELIM, "Routes run from each room centre through doors to the nearest exit (outside door on the ground floor, staircase on upper floors). Fire load, occupancy class, fire-rated construction, smoke control and sprinklers are not assessed."]);
}

export function clashSvg(p: Project, floorIndex: number, clashes: Clash[] = detectClashes(p)): string {
  const floor = p.floors[floorIndex] ?? p.floors[0];
  const v = mapper(p, [floor]);
  const o: string[] = [base(floor, v, () => "#f3f4f6")];
  const here = clashes.filter((c) => c.floorName === floor.name);
  const col = { high: "#dc2626", medium: "#d97706", info: "#2563eb" } as const;
  here.forEach((c, i) => o.push(`<circle cx="${v.X(c.x)}" cy="${v.Y(c.y)}" r="9" fill="none" stroke="${col[c.severity]}" stroke-width="2"/><text x="${v.X(c.x)}" y="${v.Y(c.y) + 3}" font-size="8" font-weight="bold" text-anchor="middle" fill="${col[c.severity]}">${i + 1}</text>`));
  o.push(north(p, v), scale(p, v));
  const rows = here.map((c, i) => [String(i + 1), c.severity, c.between, c.message]);
  const t = tableSvg("Clashes on this floor", ["#", "Level", "Between", "Issue"], rows.slice(0, 25), [24, 56, 130, 520]);
  return frameSheet(p, `Coordination clashes - ${floor.name}`, "PRELIMINARY geometric check", { svg: o.join(""), w: v.w, h: v.h }, rows.length ? [t] : [], [PRELIM, "Structure shown by the app is an indicative grid, not an engineered frame. Clashes are prompts to coordinate, not a certified BIM clash report."]);
}

export function renovationSvg(p: Project, d: RenovationDiff, floorName: string): string {
  const floor = p.floors.find((f) => f.name === floorName) ?? p.floors[0];
  const v = mapper(p, [floor]);
  const o: string[] = [];
  const changed = new Map(d.rooms.filter((r) => r.floorName === floor.name).map((r) => [r.roomId, r.kind]));
  o.push(base(floor, v, (r) => (changed.get(r.id) === "new" ? "#bbf7d0" : changed.get(r.id) === "modified" ? "#fef08a" : "#e5e7eb")));
  for (const r of d.rooms.filter((q) => q.floorName === floor.name && q.kind === "demolished")) o.push(`<rect x="${v.X(r.room.x)}" y="${v.Y(r.room.y)}" width="${f2(r.room.width * v.s)}" height="${f2(r.room.depth * v.s)}" fill="#fecaca" fill-opacity="0.7" stroke="#dc2626" stroke-dasharray="6 3"/>`);
  for (const w of d.removedWalls.filter((q) => q.floorName === floor.name)) o.push(`<line x1="${v.X(w.x1)}" y1="${v.Y(w.y1)}" x2="${v.X(w.x2)}" y2="${v.Y(w.y2)}" stroke="#dc2626" stroke-width="4" stroke-dasharray="8 4"/>`);
  for (const w of d.addedWalls.filter((q) => q.floorName === floor.name)) o.push(`<line x1="${v.X(w.x1)}" y1="${v.Y(w.y1)}" x2="${v.X(w.x2)}" y2="${v.Y(w.y2)}" stroke="#16a34a" stroke-width="4"/>`);
  for (const r of floor.rooms.filter(isValidRect)) if (r.width * v.s > 50) o.push(`<text x="${f2(v.X(r.x + r.width / 2))}" y="${f2(v.Y(r.y + r.depth / 2))}" font-size="9" text-anchor="middle" fill="${INK}">${esc(r.name)}</text>`);
  o.push(north(p, v), scale(p, v));
  const leg = [["#e5e7eb", "Existing, unchanged"], ["#bbf7d0", "New room"], ["#fef08a", "Modified room"], ["#fecaca", "Demolished room (dashed)"]].map(([c, t], i) => `<rect x="0" y="${i * 16}" width="12" height="10" fill="${c}" stroke="#9ca3af" stroke-width="0.5"/><text x="18" y="${i * 16 + 9}" font-size="9">${esc(t)}</text>`).join("") + `<line x1="0" y1="72" x2="14" y2="72" stroke="#dc2626" stroke-width="3" stroke-dasharray="4 2"/><text x="18" y="75" font-size="9">Wall removed</text><line x1="0" y1="88" x2="14" y2="88" stroke="#16a34a" stroke-width="3"/><text x="18" y="91" font-size="9">Wall added</text>`;
  const q = tableSvg("Quantities (whole building)", ["Item", "Value"], [["Walls removed", `${d.removedWallM.toFixed(1)} m`], ["Masonry to demolish", `${d.demolishedM3.toFixed(2)} m³`], ["Walls added", `${d.addedWallM.toFixed(1)} m`], ["New masonry", `${d.newM3.toFixed(2)} m³`], ["Openings added / removed", `${d.openingsAdded} / ${d.openingsRemoved}`]], [200, 110]);
  return frameSheet(p, `Renovation plan - ${floor.name}`, "Existing vs proposed", { svg: o.join(""), w: v.w, h: v.h }, [q, { svg: leg, w: 200, h: 100 }], [PRELIM, "Demolition near load-bearing walls needs a structural engineer's assessment and temporary support design. Check for services inside walls before demolition."]);
}
