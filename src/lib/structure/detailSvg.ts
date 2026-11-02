import type { Floor, Project } from "../model/types";
import { formatLength } from "../model/units";
import { isValidRect } from "../geometry/rect";
import { furnitureFor } from "../geometry/furniture";
import { stairBlocks } from "../geometry/stairs";
import { buildStructure } from "./structure";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f2 = (n: number) => Math.round(n * 100) / 100;

/**
 * SVG for the optional detail layers of one floor: footings (ground floor), beams, columns, grid lines with labels
 * and spacing, furniture symbols and stair symbols. X and Y map metres to output units, `s` is output units per metre
 * and `u` is output units per screen pixel (so line widths and text stay readable at any zoom).
 * `bubbleX` / `bubbleY` are the output coordinates where the grid-line labels sit.
 */
export function detailSvg(
  p: Project,
  floor: Floor,
  floorIndex: number,
  X: (m: number) => number,
  Y: (m: number) => number,
  s: number,
  u: number,
  bubbleX: number,
  bubbleY: number,
): string {
  const d = p.detail;
  if (!d) return "";
  const out: string[] = [];
  const sys = p.unitSystem;
  const st = d.columns || d.beams || d.footings || d.grid ? buildStructure(floor, d.maxSpan) : null;

  if (d.furniture) {
    for (const r of floor.rooms.filter(isValidRect)) {
      for (const b of furnitureFor(r)) {
        out.push(`<rect x="${f2(X(b.x))}" y="${f2(Y(b.y))}" width="${f2(b.width * s)}" height="${f2(b.depth * s)}" fill="#ffffff" fill-opacity="0.55" stroke="#7b8394" stroke-width="${f2(0.8 * u)}"/>`);
        if (b.width * s > 34 * u && b.depth * s > 12 * u) {
          out.push(`<text x="${f2(X(b.x + b.width / 2))}" y="${f2(Y(b.y + b.depth / 2) + 2.5 * u)}" font-size="${f2(7.5 * u)}" text-anchor="middle" fill="#5b6478">${esc(b.label)}</text>`);
        }
      }
    }
  }

  if (d.stairs) {
    const last = floorIndex === p.floors.length - 1;
    for (const r of floor.rooms.filter((q) => q.type === "staircase" && isValidRect(q))) {
      const blocks = stairBlocks(r, floor.height).filter((b) => b.kind === "step");
      for (const b of blocks) out.push(`<rect x="${f2(X(b.x))}" y="${f2(Y(b.y))}" width="${f2(b.width * s)}" height="${f2(b.depth * s)}" fill="none" stroke="#6b7280" stroke-width="${f2(0.7 * u)}"/>`);
      if (blocks.length || p.floors.length > 1) {
        out.push(`<text x="${f2(X(r.x + r.width / 2))}" y="${f2(Y(r.y + r.depth / 2) + 3 * u)}" font-size="${f2(9 * u)}" font-weight="bold" text-anchor="middle" fill="#1f2430">${last ? "DN" : floorIndex === 0 ? "UP" : "UP/DN"}</text>`);
      }
    }
  }

  if (st && st.columns.length) {
    if (d.footings && floorIndex === 0) {
      const fs = d.footingSize * s;
      for (const c of st.columns) out.push(`<rect x="${f2(X(c.x) - fs / 2)}" y="${f2(Y(c.y) - fs / 2)}" width="${f2(fs)}" height="${f2(fs)}" fill="none" stroke="#8a6a3c" stroke-width="${f2(1 * u)}" stroke-dasharray="${f2(5 * u)} ${f2(3 * u)}"/>`);
    }
    if (d.beams) {
      for (const b of st.beams) out.push(`<line x1="${f2(X(b.x1))}" y1="${f2(Y(b.y1))}" x2="${f2(X(b.x2))}" y2="${f2(Y(b.y2))}" stroke="#b45309" stroke-width="${f2(1.4 * u)}" stroke-dasharray="${f2(7 * u)} ${f2(3 * u)}"/>`);
    }
    if (d.columns) {
      const cs = Math.max(d.columnSize * s, 5 * u);
      for (const c of st.columns) out.push(`<rect x="${f2(X(c.x) - cs / 2)}" y="${f2(Y(c.y) - cs / 2)}" width="${f2(cs)}" height="${f2(cs)}" fill="#b91c1c" stroke="#ffffff" stroke-width="${f2(0.8 * u)}"/>`);
    }
    if (d.grid && st.bbox) {
      const r = 9 * u;
      const endY = Y(st.bbox.y1) + 12 * u;
      const endX = X(st.bbox.x1) + 12 * u;
      const line = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#b45309" stroke-opacity="0.55" stroke-width="${f2(0.7 * u)}" stroke-dasharray="${f2(10 * u)} ${f2(2 * u)} ${f2(2 * u)} ${f2(2 * u)}"/>`;
      const bubble = (cx: number, cy: number, label: string) => `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="#ffffff" stroke="#b45309" stroke-width="${f2(1 * u)}"/><text x="${f2(cx)}" y="${f2(cy + 3.2 * u)}" font-size="${f2(9 * u)}" font-weight="bold" text-anchor="middle" fill="#7c3a07">${esc(label)}</text>`;
      // labels that would touch their neighbour are moved one step outwards so every number and letter stays readable
      let lastX = -Infinity, levelX = 0;
      for (const g of st.gridX) {
        const x = X(g.pos);
        levelX = x - lastX < 2.2 * r ? (levelX + 1) % 3 : 0;
        lastX = x;
        out.push(line(x, bubbleY - levelX * 2.2 * r + r, x, endY) + bubble(x, bubbleY - levelX * 2.2 * r, g.label));
      }
      let lastY = -Infinity, levelY = 0;
      for (const g of st.gridY) {
        const y = Y(g.pos);
        levelY = y - lastY < 2.2 * r ? (levelY + 1) % 3 : 0;
        lastY = y;
        out.push(line(bubbleX - levelY * 2.2 * r + r, y, endX, y) + bubble(bubbleX - levelY * 2.2 * r, y, g.label));
      }
      for (let i = 0; i + 1 < st.gridX.length; i++) {
        const a = st.gridX[i], b = st.gridX[i + 1];
        if ((b.pos - a.pos) * s > 30 * u) out.push(`<text x="${f2((X(a.pos) + X(b.pos)) / 2)}" y="${f2(bubbleY - r - 3 * u)}" font-size="${f2(8 * u)}" text-anchor="middle" fill="#7c3a07">${esc(formatLength(b.pos - a.pos, sys))}</text>`);
      }
      for (let i = 0; i + 1 < st.gridY.length; i++) {
        const a = st.gridY[i], b = st.gridY[i + 1];
        if ((b.pos - a.pos) * s > 16 * u) out.push(`<text x="${f2(bubbleX - r - 3 * u)}" y="${f2((Y(a.pos) + Y(b.pos)) / 2 + 3 * u)}" font-size="${f2(8 * u)}" text-anchor="end" fill="#7c3a07">${esc(formatLength(b.pos - a.pos, sys))}</text>`);
      }
    }
  }
  return out.join("");
}
