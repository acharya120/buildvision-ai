import { TOL, rectBottom, rectRight, type Rect } from "./rect";

/** An axis-aligned line segment in plan coordinates (metres). */
export interface Seg {
  orient: "h" | "v";
  /** y for horizontal segments, x for vertical ones */
  fixed: number;
  from: number;
  to: number;
}
export type Side = "top" | "bottom" | "left" | "right";
export interface SideSeg extends Seg {
  side: Side;
}

export const segLength = (s: Seg) => s.to - s.from;

export function segPoint(s: Seg, t: number): { x: number; y: number } {
  return s.orient === "h" ? { x: t, y: s.fixed } : { x: s.fixed, y: t };
}

/** The wall line shared by two touching rooms, or null when they do not share an edge. */
export function sharedSegment(a: Rect, b: Rect): Seg | null {
  if (Math.abs(rectRight(a) - b.x) < TOL || Math.abs(rectRight(b) - a.x) < TOL) {
    const from = Math.max(a.y, b.y);
    const to = Math.min(rectBottom(a), rectBottom(b));
    if (to - from > TOL) return { orient: "v", fixed: Math.abs(rectRight(a) - b.x) < TOL ? b.x : a.x, from, to };
  }
  if (Math.abs(rectBottom(a) - b.y) < TOL || Math.abs(rectBottom(b) - a.y) < TOL) {
    const from = Math.max(a.x, b.x);
    const to = Math.min(rectRight(a), rectRight(b));
    if (to - from > TOL) return { orient: "h", fixed: Math.abs(rectBottom(a) - b.y) < TOL ? b.y : a.y, from, to };
  }
  return null;
}

function subtract(base: [number, number], cuts: Array<[number, number]>): Array<[number, number]> {
  let parts: Array<[number, number]> = [base];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [a, b] of parts) {
      if (c1 <= a + TOL || c0 >= b - TOL) next.push([a, b]);
      else {
        if (c0 > a + TOL) next.push([a, c0]);
        if (c1 < b - TOL) next.push([c1, b]);
      }
    }
    parts = next;
  }
  return parts.filter(([a, b]) => b - a > 0.05);
}

/** Parts of a room's edges that have no other room on the far side (i.e. exterior wall faces). */
export function exteriorSegments(r: Rect, others: Rect[]): SideSeg[] {
  const out: SideSeg[] = [];
  const touching = (side: Side) => {
    const cuts: Array<[number, number]> = [];
    for (const o of others) {
      if (side === "top" && Math.abs(rectBottom(o) - r.y) < TOL) cuts.push([Math.max(o.x, r.x), Math.min(rectRight(o), rectRight(r))]);
      if (side === "bottom" && Math.abs(o.y - rectBottom(r)) < TOL) cuts.push([Math.max(o.x, r.x), Math.min(rectRight(o), rectRight(r))]);
      if (side === "left" && Math.abs(rectRight(o) - r.x) < TOL) cuts.push([Math.max(o.y, r.y), Math.min(rectBottom(o), rectBottom(r))]);
      if (side === "right" && Math.abs(o.x - rectRight(r)) < TOL) cuts.push([Math.max(o.y, r.y), Math.min(rectBottom(o), rectBottom(r))]);
    }
    return cuts.filter(([a, b]) => b > a);
  };
  const sides: Array<[Side, "h" | "v", number, number, number]> = [
    ["top", "h", r.y, r.x, rectRight(r)],
    ["bottom", "h", rectBottom(r), r.x, rectRight(r)],
    ["left", "v", r.x, r.y, rectBottom(r)],
    ["right", "v", rectRight(r), r.y, rectBottom(r)],
  ];
  for (const [side, orient, fixed, from, to] of sides) {
    for (const [a, b] of subtract([from, to], touching(side))) out.push({ side, orient, fixed, from: a, to: b });
  }
  return out;
}

/** True when the point lies on the outline of the rectangle (within 2 cm). */
export function onBoundary(r: Rect, p: { x: number; y: number }, tol = 0.02): boolean {
  const inX = p.x >= r.x - tol && p.x <= rectRight(r) + tol;
  const inY = p.y >= r.y - tol && p.y <= rectBottom(r) + tol;
  if (!inX || !inY) return false;
  return (
    Math.abs(p.x - r.x) <= tol ||
    Math.abs(p.x - rectRight(r)) <= tol ||
    Math.abs(p.y - r.y) <= tol ||
    Math.abs(p.y - rectBottom(r)) <= tol
  );
}
