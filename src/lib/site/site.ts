import type { Floor, Project, SiteOptions } from "../model/types";
import { isValidRect, rectBottom, rectRight, type Rect } from "../geometry/rect";
import { openingGeometry } from "../geometry/walls";
import { roundMm } from "../geometry/rect";
import { pointInPolygon, polygonPath, rayExitDistance, type Pt } from "../geometry/polygon";

export type EdgeSide = "top" | "bottom" | "left" | "right";

export interface Gate {
  kind: "entrance" | "exit";
  side: EdgeSide;
  /** centre on the plot edge */
  x: number;
  y: number;
  width: number;
  vehicle: boolean;
}
export interface Tree {
  x: number;
  y: number;
  r: number;
}
export interface SiteModel {
  plot: Rect;
  building: Rect | null;
  paths: Rect[];
  gates: Gate[];
  trees: Tree[];
  /** boundary wall pieces (thin rectangles) with gaps at the gates */
  wall: Rect[];
  /** plots with a shape: the outline, and the boundary wall as line pieces along it */
  polygon?: Pt[];
  wallSegs: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  options: SiteOptions;
}

const WALL_T = 0.23;
const PATH_W = 1.2;
const DRIVE_W = 3.0;

function bbox(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map(rectRight)) - x, depth: Math.max(...rects.map(rectBottom)) - y };
}

interface ExtDoor {
  x: number;
  y: number;
  width: number;
  side: EdgeSide;
  gap: number; // distance from building edge to the plot edge on that side
}

function exteriorDoors(floor: Floor, b: Rect, plot: Rect): ExtDoor[] {
  const out: ExtDoor[] = [];
  const tol = 0.15;
  for (const o of floor.openings) {
    if (o.kind !== "door") continue;
    const w = floor.walls.find((q) => q.id === o.wallId);
    if (!w) continue;
    const g = openingGeometry(w, o);
    const x = (g.p0.x + g.p1.x) / 2;
    const y = (g.p0.y + g.p1.y) / 2;
    let side: EdgeSide | null = null;
    if (Math.abs(y - b.y) < tol) side = "top";
    else if (Math.abs(y - rectBottom(b)) < tol) side = "bottom";
    else if (Math.abs(x - b.x) < tol) side = "left";
    else if (Math.abs(x - rectRight(b)) < tol) side = "right";
    if (!side) continue;
    const gap = side === "top" ? b.y - plot.y : side === "bottom" ? rectBottom(plot) - rectBottom(b) : side === "left" ? b.x - plot.x : rectRight(plot) - rectRight(b);
    out.push({ x, y, width: o.width, side, gap });
  }
  return out;
}

const opposite: Record<EdgeSide, EdgeSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/**
 * Derives gates, paths, boundary wall and trees from the ground floor and the plot.
 * Fully deterministic. It shows where an entrance and exit COULD go from your doors; it is not a
 * landscape or traffic design and ignores local rules for gates, drives and tree spacing.
 */
export function buildSite(p: Project): SiteModel | null {
  const options = p.site;
  if (!options) return null;
  const plot: Rect = { x: 0, y: 0, width: p.plot.width, depth: p.plot.depth };
  const ground = p.floors[0];
  const rooms = p.floors.flatMap((f) => f.rooms).filter(isValidRect);
  const building = bbox(rooms);
  const poly = p.plot.polygon;
  const model: SiteModel = { plot, building, paths: [], gates: [], trees: [], wall: [], wallSegs: [], ...(poly ? { polygon: poly } : {}), options };
  if (!building) return model;

  const doors = exteriorDoors(ground, building, plot);
  // main door: widest exterior door, then the one on the side with the most room outside
  const walkIn = doors.filter((d) => d.width < 2);
  const main = [...(walkIn.length ? walkIn : doors)].sort((a, b) => b.width - a.width || b.gap - a.gap)[0];
  const frontSide: EdgeSide = main?.side ?? "bottom";
  const garageDoor = doors.find((d) => d.width >= 2 && d.side === frontSide && d !== main);
  const mk = (kind: Gate["kind"], side: EdgeSide, at: number, width: number, vehicle: boolean): Gate => {
    if (poly) {
      // shaped plot: the gate sits where a straight line from the building edge meets the outline
      const bx = side === "left" ? building.x : side === "right" ? rectRight(building) : at;
      const by = side === "top" ? building.y : side === "bottom" ? rectBottom(building) : at;
      const dir = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side];
      const dist = rayExitDistance(poly, bx, by, dir[0], dir[1]);
      return { kind, side, x: roundMm(bx + dir[0] * dist), y: roundMm(by + dir[1] * dist), width, vehicle };
    }
    const x = side === "left" ? 0 : side === "right" ? plot.width : at;
    const y = side === "top" ? 0 : side === "bottom" ? plot.depth : at;
    return { kind, side, x: roundMm(x), y: roundMm(y), width, vehicle };
  };
  const along = (d: { x: number; y: number }, side: EdgeSide) => (side === "top" || side === "bottom" ? d.x : d.y);
  const clampAt = (v: number, side: EdgeSide, w: number) => {
    if (poly) {
      const horizSide = side === "top" || side === "bottom";
      const lo = (horizSide ? building.x : building.y) + w / 2 + 0.1;
      const hi = (horizSide ? rectRight(building) : rectBottom(building)) - w / 2 - 0.1;
      return hi >= lo ? Math.min(Math.max(v, lo), hi) : (lo + hi) / 2;
    }
    const len = side === "top" || side === "bottom" ? plot.width : plot.depth;
    return Math.min(Math.max(v, w / 2 + 0.1), len - w / 2 - 0.1);
  };

  if (options.entranceGate) {
    const w = 1.2;
    model.gates.push(mk("entrance", frontSide, clampAt(along(main ?? { x: building.x + building.width / 2, y: building.y + building.depth / 2 }, frontSide), frontSide, w), w, false));
    if (garageDoor) model.gates.push(mk("entrance", frontSide, clampAt(along(garageDoor, frontSide), frontSide, 3), 3, true));
  }
  if (options.exitGate) {
    const side = opposite[frontSide];
    const rearDoor = doors.find((d) => d.side === side);
    const centre = frontSide === "top" || frontSide === "bottom" ? building.x + building.width / 2 : building.y + building.depth / 2;
    const w = 1.2;
    model.gates.push(mk("exit", side, clampAt(rearDoor ? along(rearDoor, side) : centre, side, w), w, false));
  }

  // paths from each gate to the building edge on that side
  if (options.paths) {
    for (const g of model.gates) {
      if (g.kind === "exit" && !doors.some((d) => d.side === g.side)) continue; // no door on that side: gate only
      const w = g.vehicle ? DRIVE_W : PATH_W;
      let r: Rect;
      if (g.side === "bottom") r = { x: g.x - w / 2, y: rectBottom(building), width: w, depth: g.y - rectBottom(building) };
      else if (g.side === "top") r = { x: g.x - w / 2, y: g.y, width: w, depth: building.y - g.y };
      else if (g.side === "left") r = { x: g.x, y: g.y - w / 2, width: building.x - g.x, depth: w };
      else r = { x: rectRight(building), y: g.y - w / 2, width: g.x - rectRight(building), depth: w };
      if (r.width > 0.05 && r.depth > 0.05) model.paths.push({ x: roundMm(r.x), y: roundMm(r.y), width: roundMm(r.width), depth: roundMm(r.depth) });
    }
  }

  // boundary wall: four thin strips inside the plot edge, with gaps at gates
  if (options.boundaryWall && poly) {
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      model.wallSegs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    });
  } else if (options.boundaryWall) {
    const gapsOn = (side: EdgeSide) => model.gates.filter((g) => g.side === side).map((g) => [along(g, side) - g.width / 2, along(g, side) + g.width / 2] as [number, number]).sort((a, b) => a[0] - b[0]);
    const strips = (len: number, gaps: Array<[number, number]>) => {
      const out: Array<[number, number]> = [];
      let cur = 0;
      for (const [a, b] of gaps) {
        if (a > cur + 0.01) out.push([cur, a]);
        cur = Math.max(cur, b);
      }
      if (cur < len - 0.01) out.push([cur, len]);
      return out;
    };
    for (const [a, b] of strips(plot.width, gapsOn("top"))) model.wall.push({ x: a, y: 0, width: b - a, depth: WALL_T });
    for (const [a, b] of strips(plot.width, gapsOn("bottom"))) model.wall.push({ x: a, y: plot.depth - WALL_T, width: b - a, depth: WALL_T });
    for (const [a, b] of strips(plot.depth, gapsOn("left"))) model.wall.push({ x: 0, y: a, width: WALL_T, depth: b - a });
    for (const [a, b] of strips(plot.depth, gapsOn("right"))) model.wall.push({ x: plot.width - WALL_T, y: a, width: WALL_T, depth: b - a });
  }

  // trees along the free strips, never on paths, gates or the building
  if (options.trees !== "none") {
    const spacing = options.trees === "many" ? 3.0 : 6.0;
    const strips: Rect[] = [
      { x: 0, y: 0, width: building.x, depth: plot.depth },
      { x: rectRight(building), y: 0, width: plot.width - rectRight(building), depth: plot.depth },
      { x: building.x, y: 0, width: building.width, depth: building.y },
      { x: building.x, y: rectBottom(building), width: building.width, depth: plot.depth - rectBottom(building) },
    ];
    const keepOut = [...model.paths.map((r) => ({ ...r, x: r.x - 0.6, y: r.y - 0.6, width: r.width + 1.2, depth: r.depth + 1.2 })), ...model.gates.map((g) => ({ x: g.x - 1.5, y: g.y - 1.5, width: 3, depth: 3 }))];
    const hits = (t: Tree, r: Rect) => t.x + t.r > r.x && t.x - t.r < rectRight(r) && t.y + t.r > r.y && t.y - t.r < rectBottom(r);
    strips.forEach((st, si) => {
      const inner = Math.min(st.width, st.depth);
      if (inner < 1.6) return;
      const r = Math.min(1.1, inner / 2 - 0.3);
      const horiz = st.width >= st.depth; // trees run along the long direction at the strip centre
      const len = horiz ? st.width : st.depth;
      const n = Math.max(1, Math.floor(len / spacing));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const tree: Tree = { x: roundMm(horiz ? st.x + st.width * t : st.x + st.width / 2), y: roundMm(horiz ? st.y + st.depth / 2 : st.y + st.depth * t), r: roundMm(r) };
        // the two side strips already cover the full depth; front/rear strips are narrower than the plot
        if (si >= 2 && (tree.y < 0 || tree.x < 0)) continue;
        if (hits(tree, building) || keepOut.some((q) => hits(tree, q))) continue;
        if (poly && ![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]].every(([ax, ay]) => pointInPolygon({ x: tree.x + ax * (tree.r + 0.3), y: tree.y + ay * (tree.r + 0.3) }, poly))) continue;
        if (model.trees.some((o) => Math.hypot(o.x - tree.x, o.y - tree.y) < o.r + tree.r)) continue;
        if (model.trees.length < 80) model.trees.push(tree);
      }
    });
  }
  return model;
}

/** SVG markup for the site, drawn BELOW the rooms. X/Y map metres to the drawing's units; u is the size of one pixel in those units. */
export function siteSvg(site: SiteModel, X: (m: number) => number, Y: (m: number) => number, s: number, u: number): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  const out: string[] = [];
  const rect = (r: Rect, fill: string, extra = "") => `<rect x="${f(X(r.x))}" y="${f(Y(r.y))}" width="${f(r.width * s)}" height="${f(r.depth * s)}" fill="${fill}" ${extra}/>`;
  if (site.options.lawn) out.push(site.polygon ? `<path d="${polygonPath(site.polygon, X, Y)}" fill="#d6ecd0"/>` : rect(site.plot, "#d6ecd0"));
  for (const r of site.paths) out.push(rect(r, "#cfc8bc", `stroke="#a39b8c" stroke-width="${f(0.8 * u)}"`));
  for (const t of site.trees) {
    const cx = f(X(t.x));
    const cy = f(Y(t.y));
    out.push(`<circle cx="${cx}" cy="${cy}" r="${f(t.r * s)}" fill="#6fae63" stroke="#3f7a3a" stroke-width="${f(0.8 * u)}"/>`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${f(Math.max(0.12, t.r * 0.12) * s)}" fill="#5b3f26"/>`);
  }
  for (const r of site.wall) out.push(rect(r, "#7b7468"));
  for (const w of site.wallSegs) out.push(`<line x1="${f(X(w.x1))}" y1="${f(Y(w.y1))}" x2="${f(X(w.x2))}" y2="${f(Y(w.y2))}" stroke="#7b7468" stroke-width="${f(Math.max(WALL_T * s, 2 * u))}" stroke-linecap="square"/>`);
  for (const g of site.gates) {
    const horizontal = g.side === "top" || g.side === "bottom";
    const half = g.width / 2;
    const x1 = horizontal ? g.x - half : g.x;
    const x2 = horizontal ? g.x + half : g.x;
    const y1 = horizontal ? g.y : g.y - half;
    const y2 = horizontal ? g.y : g.y + half;
    const color = g.kind === "entrance" ? "#15803d" : "#b45309";
    out.push(`<line x1="${f(X(x1))}" y1="${f(Y(y1))}" x2="${f(X(x2))}" y2="${f(Y(y2))}" stroke="${color}" stroke-width="${f(4 * u)}" stroke-linecap="round"/>`);
    // arrow pointing in (entrance) or out (exit)
    const dir = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[g.side];
    const sign = g.kind === "entrance" ? 1 : -1;
    const len = 1.2;
    const ax = g.x + dir[0] * len * sign * 0.5;
    const ay = g.y + dir[1] * len * sign * 0.5;
    const bx = g.x - dir[0] * len * sign * 0.5;
    const by = g.y - dir[1] * len * sign * 0.5;
    // draw from (bx,by) to (ax,ay) so the head points toward the inside for entrances
    out.push(`<line x1="${f(X(bx))}" y1="${f(Y(by))}" x2="${f(X(ax))}" y2="${f(Y(ay))}" stroke="${color}" stroke-width="${f(1.6 * u)}"/>`);
    const ang = Math.atan2(Y(ay) - Y(by), X(ax) - X(bx));
    const hl = 7 * u;
    const px = X(ax);
    const py = Y(ay);
    out.push(`<polygon points="${f(px)},${f(py)} ${f(px - hl * Math.cos(ang - 0.45))},${f(py - hl * Math.sin(ang - 0.45))} ${f(px - hl * Math.cos(ang + 0.45))},${f(py - hl * Math.sin(ang + 0.45))}" fill="${color}"/>`);
    const label = g.kind === "entrance" ? (g.vehicle ? "VEHICLE ENTRY" : "ENTRANCE") : "EXIT";
    const off = 12 * u;
    const lx = X(g.x) + (g.side === "left" ? off : g.side === "right" ? -off : 0);
    const ly = Y(g.y) + (g.side === "top" ? off * 2.2 : g.side === "bottom" ? -off * 1.4 : 0);
    out.push(`<text x="${f(lx)}" y="${f(ly)}" font-size="${f(11 * u)}" font-weight="bold" fill="${color}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">${label}</text>`);
  }
  return out.join("");
}
