import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { openingGeometry, wallPolygon } from "../geometry/walls";

/**
 * ASCII DXF (R12 style: LINE and TEXT only, widely readable by CAD tools). Units: metres, one
 * layer per kind, floors stacked side by side along +X so every floor can be seen at once.
 * Conceptual geometry only. Y is flipped so the drawing is not mirrored in CAD (plan y points down).
 */
export function buildDxf(p: Project): string {
  const out: string[] = [];
  const pair = (code: number, value: string | number) => out.push(String(code), String(value));
  const layers = ["PLOT", "ROOMS", "WALLS", "DOORS", "WINDOWS", "TEXT"];
  const color: Record<string, number> = { PLOT: 1, ROOMS: 8, WALLS: 7, DOORS: 3, WINDOWS: 5, TEXT: 2 };
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
  const text = (x: number, y: number, h: number, s: string) => {
    pair(0, "TEXT"); pair(8, "TEXT"); pair(10, n(x)); pair(20, n(y)); pair(30, 0); pair(40, n(h)); pair(1, clean(s));
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
    rect("PLOT", 0, 0, p.plot.width, p.plot.depth);
    text(X(0), Y(p.plot.depth) - 1.2, 0.6, `${p.name} - ${floor.name}`);
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
  });
  pair(0, "ENDSEC"); pair(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
