import type { Floor, Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_COLORS } from "../model/defaults";
import { esc, niceScaleBar } from "../export/svg";
import { formatArea, formatLength } from "../model/units";
import { planFloorInterior } from "../interior/plan";
import { openingCentre } from "../review/roomEdges";
import { frameSheet, INK, f2, tableSvg, type Body } from "./frame";

export function interiorSvg(p: Project, floorId?: string): string {
  const floor: Floor = p.floors.find((f) => f.id === floorId) ?? p.floors[0];
  const rooms = floor.rooms.filter(isValidRect);
  const PAD = 50;
  const xs = rooms.flatMap((r) => [r.x, r.x + r.width]);
  const ys = rooms.flatMap((r) => [r.y, r.y + r.depth]);
  const x0 = xs.length ? Math.min(...xs) : 0, x1 = xs.length ? Math.max(...xs) : p.plot.width;
  const y0 = ys.length ? Math.min(...ys) : 0, y1 = ys.length ? Math.max(...ys) : p.plot.depth;
  const s = Math.max(3, Math.min(80, 780 / Math.max(1, x1 - x0), 620 / Math.max(1, y1 - y0)));
  const X = (m: number) => f2(PAD + (m - x0) * s);
  const Y = (m: number) => f2(PAD + (m - y0) * s);
  const o: string[] = [];
  const interiors = planFloorInterior(floor);
  for (const r of rooms) o.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${f2(r.width * s)}" height="${f2(r.depth * s)}" fill="${ROOM_COLORS[r.type]}" opacity="0.55"/>`);
  for (const w of floor.walls) o.push(`<line x1="${X(w.x1)}" y1="${Y(w.y1)}" x2="${X(w.x2)}" y2="${Y(w.y2)}" stroke="${INK}" stroke-width="${f2(Math.max(1.6, w.thickness * s))}"/>`);
  for (const op of floor.openings) {
    const w = floor.walls.find((q) => q.id === op.wallId);
    if (!w) continue;
    const c = openingCentre(w, op);
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
    const h = op.width / 2;
    o.push(`<line x1="${X(c.x - ux * h)}" y1="${Y(c.y - uy * h)}" x2="${X(c.x + ux * h)}" y2="${Y(c.y + uy * h)}" stroke="${op.kind === "door" ? "#8a5a2b" : "#3b82c4"}" stroke-width="${f2(Math.max(2.2, w.thickness * s * 0.8))}" stroke-linecap="butt"/>`);
  }
  for (const ri of interiors) {
    for (const i of ri.items) {
      o.push(`<rect x="${X(i.x)}" y="${Y(i.y)}" width="${f2(i.width * s)}" height="${f2(i.depth * s)}" rx="2" fill="${i.color}" stroke="#4b5263" stroke-width="0.8"/>`);
      const fits = i.width * s > i.name.length * 4.2 || i.depth * s > i.name.length * 4.2;
      if (fits && Math.min(i.width, i.depth) * s > 9) {
        const vertical = i.depth * s > i.width * s && i.width * s < i.name.length * 4.2;
        const cx = X(i.x + i.width / 2), cy = Y(i.y + i.depth / 2);
        o.push(`<text x="${cx}" y="${f2(cy + 2.5)}" font-size="7" text-anchor="middle" fill="#1f2430"${vertical ? ` transform="rotate(-90 ${cx} ${cy})"` : ""}>${esc(i.name)}</text>`);
      }
    }
  }
  for (const r of rooms) {
    if (r.width * s > 60 && r.depth * s > 40) o.push(`<text x="${X(r.x) + 5}" y="${Y(r.y) + 12}" font-size="9.5" font-weight="bold" fill="${INK}">${esc(r.name)}</text><text x="${X(r.x) + 5}" y="${Y(r.y) + 23}" font-size="8" fill="#4b5263">${esc(formatArea(r.width * r.depth, p.unitSystem))}</text>`);
  }
  const sb = niceScaleBar(Math.max(x1 - x0, y1 - y0, 1), p.unitSystem);
  const W = (x1 - x0) * s + PAD * 2, H = (y1 - y0) * s + PAD * 2 + 20;
  const bx = PAD, by = H - 16;
  o.push(`<line x1="${bx}" y1="${by}" x2="${f2(bx + sb.meters * s)}" y2="${by}" stroke="${INK}" stroke-width="2"/><text x="${f2(bx + (sb.meters * s) / 2)}" y="${by + 12}" font-size="9" text-anchor="middle" fill="${INK}">${esc(sb.label)}</text>`);

  const rows: string[][] = [];
  for (const ri of interiors) for (const i of ri.items) rows.push([ri.roomName, i.name, `${formatLength(Math.max(i.width, i.depth), p.unitSystem)} x ${formatLength(Math.min(i.width, i.depth), p.unitSystem)}`]);
  const table = tableSvg("Furniture schedule", ["Room", "Item", "Size"], rows.slice(0, 40), [150, 170, 140]);
  const notes = [
    "Furniture is placed by rules: against walls, outside door swings, tall pieces not in front of windows. It is a suggestion, not a design; move or change anything to suit the room.",
    ...interiors.filter((r) => r.notPlaced.length).map((r) => `${r.roomName}: did not fit - ${r.notPlaced.join(", ")}.`),
    ...(rows.length > 40 ? [`Schedule shows the first 40 of ${rows.length} items; download the CSV for all.`] : []),
  ];
  const body: Body = { svg: o.join(""), w: W, h: H };
  return frameSheet(p, `Interior layout - ${floor.name}`, "Furniture and fittings suggestion", body, rows.length ? [table] : [], notes);
}
