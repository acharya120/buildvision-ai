import type { Project } from "../model/types";
import { buildElevation, type Side } from "../export/drawings";
import { esc } from "../export/svg";
import { formatLength } from "../model/units";
import { frameSheet, INK, f2, type Body } from "./frame";

export type ElevationView = "front" | "rear" | "left" | "right";
export const ELEVATION_VIEWS: Array<{ id: ElevationView; label: string; side: Side }> = [
  { id: "front", label: "Front elevation", side: "south" },
  { id: "rear", label: "Rear elevation", side: "north" },
  { id: "left", label: "Left side elevation", side: "west" },
  { id: "right", label: "Right side elevation", side: "east" },
];

const C = { wall: "#efe3d0", wallLine: "#7a6a55", plinth: "#b9b3a8", parapet: "#d8cfc0", glass: "#a9d4f2", frame: "#3b4658", door: "#8a5a2b", ground: "#5c6b4a", slab: "#6b7280" };

/**
 * Detailed elevation from the same model as every other view: floor levels, plinth, slab edges, lintels, sills,
 * window frames and door panels, flat roof with parapet, level marks and overall dimensions.
 * Finishes are indicative colours, not a specification.
 */
export function elevationSvg(p: Project, view: ElevationView): string {
  const def = ELEVATION_VIEWS.find((v) => v.id === view) ?? ELEVATION_VIEWS[0];
  const d = buildElevation(p, def.side);
  const plinth = p.detail?.plinthHeight ?? 0.45;
  const parapet = p.detail?.parapetHeight ?? 0.9;
  const total = d.height + plinth + parapet;
  const walls = d.rects.filter((r) => r.kind === "wall");
  const sys = p.unitSystem;
  const margin = 70;
  const s = Math.max(4, Math.min(60, 700 / Math.max(d.width, total * 1.3, 1)));
  const W = d.width * s + margin * 2 + 40;
  const H = total * s + margin * 2 + 20;
  const X = (m: number) => f2(margin + m * s);
  const Y = (z: number) => f2(margin + (total - z) * s); // z measured from ground level
  const o: string[] = [];
  const e = (z: number) => z + plinth;

  // ground
  o.push(`<rect x="${X(0) - 30}" y="${Y(0)}" width="${f2(d.width * s + 60)}" height="10" fill="${C.ground}" opacity="0.35"/><line x1="${X(0) - 30}" y1="${Y(0)}" x2="${X(d.width) + 30}" y2="${Y(0)}" stroke="${INK}" stroke-width="1.6"/>`);
  if (!walls.length) o.push(`<text x="${X(d.width / 2)}" y="${Y(total / 2)}" font-size="12" text-anchor="middle" fill="#6b7280">Add rooms to see the elevation.</text>`);

  // plinth under the lowest floor, wall bodies, slab edges
  const first = walls.find((w) => w.z0 === 0) ?? walls[0];
  if (first) o.push(`<rect x="${X(first.h0)}" y="${Y(plinth)}" width="${f2((first.h1 - first.h0) * s)}" height="${f2(plinth * s)}" fill="${C.plinth}" stroke="${C.wallLine}" stroke-width="0.8"/>`);
  for (const w of walls) {
    o.push(`<rect x="${X(w.h0)}" y="${Y(e(w.z1))}" width="${f2((w.h1 - w.h0) * s)}" height="${f2((w.z1 - w.z0) * s)}" fill="${C.wall}" stroke="${C.wallLine}" stroke-width="0.9"/>`);
    o.push(`<line x1="${X(w.h0) - 3}" y1="${Y(e(w.z0))}" x2="${X(w.h1) + 3}" y2="${Y(e(w.z0))}" stroke="${C.slab}" stroke-width="2.4"/>`);
  }
  // roof slab and parapet over the highest wall run
  const top = walls.reduce((a, w) => (w.z1 > a.z1 ? w : a), walls[0]);
  if (top) {
    const roofZ = e(top.z1);
    o.push(`<rect x="${X(top.h0)}" y="${Y(roofZ + parapet)}" width="${f2((top.h1 - top.h0) * s)}" height="${f2(parapet * s)}" fill="${C.parapet}" stroke="${C.wallLine}" stroke-width="0.9"/>`);
    o.push(`<rect x="${X(top.h0) - 3}" y="${Y(roofZ + parapet) - 3}" width="${f2((top.h1 - top.h0) * s + 6)}" height="3" fill="${C.slab}"/>`);
  }
  // openings
  for (const r of d.rects.filter((q) => q.kind === "window" || q.kind === "door")) {
    const x = X(r.h0), w = f2((r.h1 - r.h0) * s), y = Y(e(r.z1)), h = f2((r.z1 - r.z0) * s);
    if (r.kind === "window") {
      o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.glass}" stroke="${C.frame}" stroke-width="1.3"/><line x1="${f2(x + w / 2)}" y1="${y}" x2="${f2(x + w / 2)}" y2="${f2(y + h)}" stroke="${C.frame}" stroke-width="0.9"/><line x1="${x - 2}" y1="${f2(y + h + 1.5)}" x2="${f2(x + w + 2)}" y2="${f2(y + h + 1.5)}" stroke="${C.wallLine}" stroke-width="2"/><line x1="${x - 2}" y1="${f2(y - 1.5)}" x2="${f2(x + w + 2)}" y2="${f2(y - 1.5)}" stroke="${C.wallLine}" stroke-width="1.2"/>`);
    } else {
      o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.door}" stroke="#4b2e12" stroke-width="1.2"/><rect x="${f2(x + w * 0.15)}" y="${f2(y + h * 0.1)}" width="${f2(w * 0.7)}" height="${f2(h * 0.35)}" fill="none" stroke="#e9d4b8" stroke-width="0.7"/><rect x="${f2(x + w * 0.15)}" y="${f2(y + h * 0.55)}" width="${f2(w * 0.7)}" height="${f2(h * 0.35)}" fill="none" stroke="#e9d4b8" stroke-width="0.7"/><line x1="${x - 2}" y1="${f2(y - 1.5)}" x2="${f2(x + w + 2)}" y2="${f2(y - 1.5)}" stroke="${C.wallLine}" stroke-width="1.2"/>`);
    }
  }
  // level marks (left) and heights (right)
  const lvl = (z: number, text: string) => `<g><path d="M${X(0) - 46} ${Y(z)} l6 -7 l6 7 z" fill="${INK}"/><line x1="${X(0) - 46}" y1="${Y(z)}" x2="${X(0) - 8}" y2="${Y(z)}" stroke="${INK}" stroke-width="0.7"/><text x="${X(0) - 50}" y="${Y(z) - 3}" font-size="8.5" text-anchor="end" fill="${INK}">${esc(text)}</text></g>`;
  const sign = (v: number) => (v >= 0 ? "+" : "-") + formatLength(Math.abs(v), sys);
  o.push(lvl(0, "GL +0.00"));
  const levels = new Set<number>([plinth]);
  p.floors.forEach((f, i) => levels.add(e(p.floors.slice(0, i).reduce((a, q) => a + q.height, 0))));
  [...levels].sort((a, b) => a - b).forEach((z) => o.push(lvl(z, `${z === plinth && p.floors.length ? "FFL " : "Level "}${sign(z)}`)));
  if (top) o.push(lvl(e(top.z1), `Roof ${sign(e(top.z1))}`), lvl(e(top.z1) + parapet, `Parapet ${sign(e(top.z1) + parapet)}`));
  // overall dimensions
  if (first) {
    const x0 = X(first.h0), x1 = X(first.h1), by = Y(0) + 26;
    o.push(`<line x1="${x0}" y1="${by}" x2="${x1}" y2="${by}" stroke="${INK}" stroke-width="0.8"/><line x1="${x0}" y1="${by - 4}" x2="${x0}" y2="${by + 4}" stroke="${INK}"/><line x1="${x1}" y1="${by - 4}" x2="${x1}" y2="${by + 4}" stroke="${INK}"/><text x="${f2((x0 + x1) / 2)}" y="${by + 13}" font-size="10" text-anchor="middle" fill="${INK}">${esc(formatLength(first.h1 - first.h0, sys))}</text>`);
    const rx = X(first.h1) + 22;
    o.push(`<line x1="${rx}" y1="${Y(0)}" x2="${rx}" y2="${Y(e(top.z1) + parapet)}" stroke="${INK}" stroke-width="0.8"/><text x="${rx + 6}" y="${f2((Y(0) + Y(e(top.z1) + parapet)) / 2)}" font-size="10" fill="${INK}" transform="rotate(90 ${rx + 6} ${f2((Y(0) + Y(e(top.z1) + parapet)) / 2)})" text-anchor="middle">${esc(formatLength(e(top.z1) + parapet, sys))} overall</text>`);
  }
  const body: Body = { svg: o.join(""), w: W, h: H + 10 };
  const legend: Body = { svg: [["Plastered & painted wall", C.wall], ["Plinth", C.plinth], ["Parapet", C.parapet], ["Glazed window", C.glass], ["Door", C.door]].map(([t, c], i) => `<rect x="0" y="${i * 16}" width="12" height="10" fill="${c}" stroke="${C.wallLine}" stroke-width="0.6"/><text x="18" y="${i * 16 + 9}" font-size="9" fill="${INK}">${esc(t)}</text>`).join(""), w: 160, h: 80 };
  const notes = [
    `Seen from the ${def.side} side of the plan. The "front" is taken as the bottom edge of the plan; the rear is the top edge.`,
    `Plinth ${formatLength(plinth, sys)} and parapet ${formatLength(parapet, sys)} come from the Structure/detail settings when present, otherwise these defaults are assumed. Finishes shown are indicative colours only.`,
  ];
  return frameSheet(p, def.label, `Elevation - ${p.floors.length} floor${p.floors.length === 1 ? "" : "s"}`, body, [legend], notes);
}
