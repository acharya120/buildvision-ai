import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { openingGeometry, wallPolygon } from "../geometry/walls";
import { furnitureFor } from "../geometry/furniture";
import { buildStructure } from "../structure/structure";
import { DEFAULT_LAYERS, type ExportLayers } from "./layers";

/**
 * ASCII DXF (R12 style: LINE and TEXT only, widely readable by CAD tools). Units: metres, one
 * layer per kind, floors stacked side by side along +X so every floor can be seen at once.
 * Conceptual geometry only. Y is flipped so the drawing is not mirrored in CAD (plan y points down).
 */
export interface DxfOptions {
  /**
   * Optional extra layers: GRID (structural grid lines), DIMENSIONS (plot size and your own dimensions) and FURNITURE
   * (indicative symbols). Each is added only when its flag is true. When this option is absent the file is exactly as before.
   */
  layers?: Partial<ExportLayers>;
}

export function buildDxf(p: Project, opts: DxfOptions = {}): string {
  const L = opts.layers ? { ...DEFAULT_LAYERS, ...opts.layers } : null;
  const out: string[] = [];
  const pair = (code: number, value: string | number) => out.push(String(code), String(value));
  const layers = ["PLOT", "ROOMS", "WALLS", "DOORS", "WINDOWS", "TEXT"];
  if (L?.grid) layers.push("GRID");
  if (L?.dimensions) layers.push("DIMENSIONS");
  if (L?.furniture) layers.push("FURNITURE");
  const color: Record<string, number> = { PLOT: 1, ROOMS: 8, WALLS: 7, DOORS: 3, WINDOWS: 5, TEXT: 2, GRID: 9, DIMENSIONS: 6, FURNITURE: 4 };
  const n = (v: number) => (Math.round(v * 10000) / 10000).toString();
  const clean = (t: string) => t.replace(/[\r\n]/g, " ").replace(/[^\x20-\x7E]/g, "?").slice(0, 120);

  pair(0, "SECTION"); pair(2, "HEADER"); pair(9, "$INSUNITS"); pair(70, 6); pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "TABLES"); pair(0, "TABLE"); pair(2, "LAYER"); pair(70, layers.length);
  for (const l of layers) { pair(0, "LAYER"); pair(2, l); pair(70, 0); pair(62, color[l]); pair(6, "CONTINUOUS"); }
  pair(0, "ENDTAB"); pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "ENTITIES");

  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    pair(0, "LINE"); pair(8, layer); pair(10, n(x1)); pair(20, n(y1)); pair(30, 0); pair(11, n(x2)); pair(21, n(y2)); pair(31, 0);
  };
  const text = (x: number, y: number, h: number, s: string, layer = "TEXT") => {
    pair(0, "TEXT"); pair(8, layer); pair(10, n(x)); pair(20, n(y)); pair(30, 0); pair(40, n(h)); pair(1, clean(s));
  };

  const gap = Math.max(5, p.plot.width * 0.15);
  p.floors.forEach((floor, fi) => {
    const dx = fi * (p.plot.width + gap);
    const X = (x: number) => x + dx;
    const Y = (y: number) => p.plot.depth - y;
    const rect = (layer: string, x: number, y: number, w: number, d: number) => {
      line(layer, X(x), Y(y), X(x + w), Y(y));
      line(layer, X(x + w), Y(y), X(x + w), Y(y + d));
      line(layer, X(x + w), Y(y + d), X(x), Y(y + d));
      line(layer, X(x), Y(y + d), X(x), Y(y));
    };
    if (p.plot.polygon) {
      const pg = p.plot.polygon;
      pg.forEach((a, i) => { const b = pg[(i + 1) % pg.length]; line("PLOT", X(a.x), Y(a.y), X(b.x), Y(b.y)); });
    } else rect("PLOT", 0, 0, p.plot.width, p.plot.depth);
    text(X(0), Y(p.plot.depth) - 1.2, 0.6, `${p.name} - ${floor.name}`);
    if (L) text(X(0), Y(p.plot.depth) - 2.2, 0.3, "PRELIMINARY CONCEPT - not an approved or certified drawing");
    for (const r of floor.rooms.filter(isValidRect)) {
      rect("ROOMS", r.x, r.y, r.width, r.depth);
      text(X(r.x + 0.2), Y(r.y + r.depth / 2), Math.min(0.35, r.width / 12), `${r.name} ${r.width.toFixed(2)} x ${r.depth.toFixed(2)} m`);
    }
    for (const w of floor.walls) {
      const poly = wallPolygon(w);
      poly.forEach((pt, i) => {
        const q = poly[(i + 1) % poly.length];
        line("WALLS", X(pt.x), Y(pt.y), X(q.x), Y(q.y));
      });
    }
    for (const o of floor.openings) {
      const w = floor.walls.find((q) => q.id === o.wallId);
      if (!w) continue;
      const g = openingGeometry(w, o);
      const layer = o.kind === "door" ? "DOORS" : "WINDOWS";
      line(layer, X(g.p0.x), Y(g.p0.y), X(g.p1.x), Y(g.p1.y));
      if (o.kind === "door") line(layer, X(g.p0.x), Y(g.p0.y), X(g.p0.x + g.normal.x * o.width), Y(g.p0.y + g.normal.y * o.width));
    }
    if (L?.furniture) {
      for (const r of floor.rooms.filter(isValidRect)) for (const b of furnitureFor(r)) rect("FURNITURE", b.x, b.y, b.width, b.depth);
    }
    if (L?.grid) {
      const st = buildStructure(floor, p.detail?.maxSpan ?? 6);
      if (st.bbox) {
        const ext = 1;
        for (const gx of st.gridX) { line("GRID", X(gx.pos), Y(st.bbox.y0 - ext), X(gx.pos), Y(st.bbox.y1 + ext)); text(X(gx.pos) - 0.1, Y(st.bbox.y0 - ext) + 0.3, 0.3, gx.label, "GRID"); }
        for (const gy of st.gridY) { line("GRID", X(st.bbox.x0 - ext), Y(gy.pos), X(st.bbox.x1 + ext), Y(gy.pos)); text(X(st.bbox.x0 - ext) - 0.6, Y(gy.pos) - 0.1, 0.3, gy.label, "GRID"); }
      }
    }
    if (L?.dimensions) {
      const dim = (x1: number, y1: number, x2: number, y2: number, lbl: string) => {
        line("DIMENSIONS", X(x1), Y(y1), X(x2), Y(y2));
        text(X((x1 + x2) / 2), Y((y1 + y2) / 2) + 0.15, 0.25, lbl, "DIMENSIONS");
      };
      dim(0, -0.8, p.plot.width, -0.8, `${p.plot.width.toFixed(2)} m`);
      dim(-0.8, 0, -0.8, p.plot.depth, `${p.plot.depth.toFixed(2)} m`);
      for (const d of floor.dimensions) dim(d.x1, d.y1, d.x2, d.y2, `${Math.hypot(d.x2 - d.x1, d.y2 - d.y1).toFixed(2)} m`);
    }
  });
  pair(0, "ENDSEC"); pair(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
