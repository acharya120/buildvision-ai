import type { Rect } from "./rect";

/** Plot outlines that are not plain rectangles. All values in metres. */
export interface Pt {
  x: number;
  y: number;
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonBBox(poly: Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: Math.min(...poly.map((p) => p.x)), y0: Math.min(...poly.map((p) => p.y)), x1: Math.max(...poly.map((p) => p.x)), y1: Math.max(...poly.map((p) => p.y)) };
}

const EPS = 1e-7;

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return false;
  return p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
}

/** inside or on the boundary */
export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) if (onSegment(pt, poly[i], poly[(i + 1) % poly.length])) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** true when the open segments cross at a single interior point of both */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** at least 3 corners, positive area, and no two edges crossing each other */
export function isSimplePolygon(poly: Pt[]): boolean {
  if (poly.length < 3 || polygonArea(poly) < 1e-6) return false;
  const n = poly.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (crosses(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  // two corners on top of each other
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(poly[i].x - poly[j].x, poly[i].y - poly[j].y) < 1e-6) return false;
  return true;
}

/** the whole rectangle lies inside the polygon (touching the boundary is fine) */
export function rectInsidePolygon(r: Rect, poly: Pt[]): boolean {
  const c: Pt[] = [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.depth }, { x: r.x, y: r.y + r.depth }];
  if (!c.every((p) => pointInPolygon(p, poly))) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    for (let k = 0; k < 4; k++) if (crosses(a, b, c[k], c[(k + 1) % 4])) return false;
    // a polygon corner strictly inside the rectangle means the outline cuts into it
    const e = 1e-6;
    if (a.x > r.x + e && a.x < r.x + r.width - e && a.y > r.y + e && a.y < r.y + r.depth - e) return false;
  }
  return true;
}

/**
 * Largest axis-aligned rectangle inside the polygon (grid search, accurate to about 1/100 of the plot).
 * Used to place a generated layout on an irregular plot.
 */
export function largestInscribedRect(poly: Pt[]): Rect | null {
  const bb = polygonBBox(poly);
  const bw = bb.x1 - bb.x0, bd = bb.y1 - bb.y0;
  if (!(bw > 0) || !(bd > 0)) return null;
  const step = Math.max(bw, bd) / 100;
  const nx = Math.max(1, Math.ceil(bw / step - 1e-9)), ny = Math.max(1, Math.ceil(bd / step - 1e-9));
  const cw = bw / nx, ch = bd / ny;
  const cell: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    cell.push([]);
    for (let i = 0; i < nx; i++) cell[j].push(rectInsidePolygon({ x: bb.x0 + i * cw, y: bb.y0 + j * ch, width: cw, depth: ch }, poly));
  }
  // largest rectangle of true cells (histogram method)
  const h = new Array<number>(nx).fill(0);
  let best = { area: 0, i0: 0, j0: 0, w: 0, hgt: 0 };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) h[i] = cell[j][i] ? h[i] + 1 : 0;
    const stack: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const cur = i === nx ? 0 : h[i];
      while (stack.length && h[stack[stack.length - 1]] >= cur) {
        const height = h[stack.pop()!];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = i - left;
        if (height * width > best.area) best = { area: height * width, i0: left, j0: j - height + 1, w: width, hgt: height };
      }
      stack.push(i);
    }
  }
  if (best.area === 0) return null;
  // round inwards to the millimetre plus a 2 mm margin, so later rounding can never push a room over the edge
  const m = 0.002;
  const x0 = Math.ceil((bb.x0 + best.i0 * cw + m) * 1000) / 1000, y0 = Math.ceil((bb.y0 + best.j0 * ch + m) * 1000) / 1000;
  const x1 = Math.floor((bb.x0 + (best.i0 + best.w) * cw - m) * 1000) / 1000, y1 = Math.floor((bb.y0 + (best.j0 + best.hgt) * ch - m) * 1000) / 1000;
  return { x: x0, y: y0, width: Math.round((x1 - x0) * 1000) / 1000, depth: Math.round((y1 - y0) * 1000) / 1000 };
}

/** distance from (x,y) along (dx,dy) until the ray leaves the polygon; 0 when it starts outside */
export function rayExitDistance(poly: Pt[], x: number, y: number, dx: number, dy: number): number {
  let lo = 0, hi = 1;
  const bb = polygonBBox(poly);
  const far = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) * 1.5 + 1;
  if (!pointInPolygon({ x, y }, poly)) return 0;
  hi = far;
  // the polygon may be concave: find the first exit by stepping, then refine
  const n = 400;
  let prev = 0;
  for (let k = 1; k <= n; k++) {
    const t = (far * k) / n;
    if (!pointInPolygon({ x: x + dx * t, y: y + dy * t }, poly)) {
      lo = prev;
      hi = t;
      for (let it = 0; it < 30; it++) {
        const m = (lo + hi) / 2;
        if (pointInPolygon({ x: x + dx * m, y: y + dy * m }, poly)) lo = m;
        else hi = m;
      }
      return lo;
    }
    prev = t;
  }
  return far;
}

export const polygonPath = (poly: Pt[], X: (m: number) => number, Y: (m: number) => number): string =>
  poly.map((p, i) => `${i ? "L" : "M"}${Math.round(X(p.x) * 100) / 100} ${Math.round(Y(p.y) * 100) / 100}`).join(" ") + " Z";
