/** Axis-aligned rectangle geometry. All values in meters. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  depth: number;
}

/** 1 mm tolerance for all comparisons. */
export const TOL = 0.001;

export const rectArea = (r: Rect) => r.width * r.depth;
export const rectRight = (r: Rect) => r.x + r.width;
export const rectBottom = (r: Rect) => r.y + r.depth;

export function isValidRect(r: Rect): boolean {
  return (
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.width) &&
    Number.isFinite(r.depth) &&
    r.width > TOL &&
    r.depth > TOL
  );
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const d = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  return w > 0 && d > 0 ? w * d : 0;
}

/** True when the rectangles share interior area (touching edges do NOT overlap). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const d = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  return w > TOL && d > TOL;
}

export function isInsidePlot(r: Rect, plot: { width: number; depth: number }): boolean {
  return (
    r.x >= -TOL &&
    r.y >= -TOL &&
    rectRight(r) <= plot.width + TOL &&
    rectBottom(r) <= plot.depth + TOL
  );
}

/** Length of the shared boundary when two rectangles touch along an edge, else 0. */
export function sharedEdgeLength(a: Rect, b: Rect): number {
  let best = 0;
  if (Math.abs(rectRight(a) - b.x) < TOL || Math.abs(rectRight(b) - a.x) < TOL) {
    const len = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
    if (len > best) best = len;
  }
  if (Math.abs(rectBottom(a) - b.y) < TOL || Math.abs(rectBottom(b) - a.y) < TOL) {
    const len = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
    if (len > best) best = len;
  }
  return best;
}

/** Area of `r` that is not covered by any rectangle in `others` (exact, via coordinate compression). */
export function uncoveredArea(r: Rect, others: Rect[]): number {
  if (!isValidRect(r)) return 0;
  const xs = new Set<number>([r.x, rectRight(r)]);
  const ys = new Set<number>([r.y, rectBottom(r)]);
  for (const o of others) {
    if (o.x > r.x && o.x < rectRight(r)) xs.add(o.x);
    if (rectRight(o) > r.x && rectRight(o) < rectRight(r)) xs.add(rectRight(o));
    if (o.y > r.y && o.y < rectBottom(r)) ys.add(o.y);
    if (rectBottom(o) > r.y && rectBottom(o) < rectBottom(r)) ys.add(rectBottom(o));
  }
  const sx = [...xs].sort((p, q) => p - q);
  const sy = [...ys].sort((p, q) => p - q);
  let uncovered = 0;
  for (let i = 0; i < sx.length - 1; i++) {
    for (let j = 0; j < sy.length - 1; j++) {
      const cx = (sx[i] + sx[i + 1]) / 2;
      const cy = (sy[j] + sy[j + 1]) / 2;
      const covered = others.some(
        (o) => cx > o.x && cx < rectRight(o) && cy > o.y && cy < rectBottom(o),
      );
      if (!covered) uncovered += (sx[i + 1] - sx[i]) * (sy[j + 1] - sy[j]);
    }
  }
  return uncovered;
}

export function snapValue(v: number, step: number): number {
  if (!(step > 0)) return v;
  return Math.round(v / step) * step;
}

export function boundingBox(rects: Rect[]): Rect | null {
  const valid = rects.filter(isValidRect);
  if (!valid.length) return null;
  const x1 = Math.min(...valid.map((r) => r.x));
  const y1 = Math.min(...valid.map((r) => r.y));
  const x2 = Math.max(...valid.map(rectRight));
  const y2 = Math.max(...valid.map(rectBottom));
  return { x: x1, y: y1, width: x2 - x1, depth: y2 - y1 };
}

/** Round to millimetres to keep stored coordinates tidy. */
export const roundMm = (v: number) => Math.round(v * 1000) / 1000;
