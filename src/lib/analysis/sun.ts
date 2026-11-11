import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { floorElevations } from "../export/drawings";
import { roomOpenings } from "../review/roomEdges";
import { SECTOR_NAMES, angDiff, edgeBearing, norm360, planAngleOfBearing, sectorOf, type Sector } from "./compass";

const D2R = Math.PI / 180;
export const dayOfYear = (month: number, day: number): number => {
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dim.slice(0, month - 1).reduce((a, b) => a + b, 0) + day;
};
export const declination = (n: number) => 23.45 * Math.sin(D2R * (360 / 365) * (284 + n));

export interface SunPos { altitude: number; azimuth: number }
/**
 * Sun position from latitude (degrees, north positive), day of year and SOLAR hour (12 = solar noon).
 * Standard textbook formulas; accurate to about a degree, ignores refraction and the equation of time.
 */
export function sunPosition(lat: number, n: number, hour: number): SunPos {
  const dec = declination(n) * D2R, phi = lat * D2R, w = 15 * (hour - 12) * D2R;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(w);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAlt = Math.cos(alt);
  let az = 0;
  if (cosAlt > 1e-6 && Math.abs(Math.cos(phi)) > 1e-6) {
    const c = (Math.sin(dec) - Math.sin(alt) * Math.sin(phi)) / (cosAlt * Math.cos(phi));
    az = Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
    if (w > 0) az = 360 - az;
  }
  return { altitude: alt / D2R, azimuth: az };
}

/** Daylight length in solar hours (0 in polar night, 24 in midnight sun). */
export function dayLength(lat: number, n: number): number {
  const x = -Math.tan(lat * D2R) * Math.tan(declination(n) * D2R);
  if (x >= 1) return 0;
  if (x <= -1) return 24;
  return (2 * Math.acos(x)) / D2R / 15;
}

type Pt = { x: number; y: number };
function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up: Pt[] = [];
  for (const p of pts.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Ground shadows of every room block for the given sun position. Empty when the sun is below ~2 degrees. */
export function shadowPolygons(p: Project, sun: SunPos): Pt[][] {
  if (sun.altitude < 2) return [];
  const north = p.northAngle ?? 0;
  const pa = planAngleOfBearing(sun.azimuth + 180, north) * D2R; // shadow points away from the sun
  const ux = Math.sin(pa), uy = -Math.cos(pa);
  const elev = floorElevations(p);
  const plinth = p.detail?.plinthHeight ?? 0.45;
  const out: Pt[][] = [];
  p.floors.forEach((f, i) => {
    const top = elev[i] + f.height + plinth + (i === p.floors.length - 1 ? p.detail?.parapetHeight ?? 0.9 : 0);
    const len = Math.min(200, top / Math.tan(sun.altitude * D2R));
    for (const r of f.rooms.filter(isValidRect)) {
      const c: Pt[] = [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.depth }, { x: r.x, y: r.y + r.depth }];
      out.push(hull([...c, ...c.map((q) => ({ x: q.x + ux * len, y: q.y + uy * len }))]));
    }
  });
  return out;
}

export interface WindowSun { floorName: string; room: string; sector: Sector; bearing: number; area: number; hours: number }
export interface SunReport {
  dayLength: number;
  windows: WindowSun[];
  /** direct-sun hours on each of the four main facades */
  facades: Array<{ sector: Sector; hours: number }>;
  notes: string[];
}

/** Hours of direct sun falling on a wall facing `bearing` (sun in front of the wall and above 2 degrees). Neighbouring buildings are not considered. */
export function sunHoursOn(lat: number, n: number, bearing: number, step = 0.1): number {
  let h = 0;
  for (let t = 0; t < 24; t += step) {
    const s = sunPosition(lat, n, t);
    if (s.altitude > 2 && Math.abs(angDiff(s.azimuth, bearing)) < 85) h += step;
  }
  return Math.round(h * 10) / 10;
}

export function sunReport(p: Project, lat: number, n: number): SunReport {
  const north = p.northAngle ?? 0;
  const windows: WindowSun[] = [];
  for (const f of p.floors) {
    for (const r of f.rooms.filter(isValidRect)) {
      for (const ro of roomOpenings(f, r)) {
        if (ro.opening.kind !== "window" || !ro.edge.exterior) continue;
        const bearing = edgeBearing(ro.edge.side, north);
        windows.push({ floorName: f.name, room: r.name, sector: sectorOf(bearing), bearing, area: ro.opening.width * ro.opening.height, hours: sunHoursOn(lat, n, bearing) });
      }
    }
  }
  const facades = ([0, 90, 180, 270] as const).map((b) => ({ sector: sectorOf(b), hours: sunHoursOn(lat, n, b) }));
  const notes: string[] = [];
  const hot = windows.filter((w) => w.hours >= 5 && Math.abs(angDiff(w.bearing, 270)) < 60 && w.area > 1);
  if (lat > 0 && hot.length) notes.push(`${hot.length} window(s) face west or near-west and get ${Math.min(...hot.map((w) => w.hours))}+ hours of direct sun, which brings afternoon heat. Consider shading (chajja, louvres) or smaller openings there.`);
  if (lat > 0 && windows.every((w) => w.sector !== "S" && w.sector !== "SE" && w.sector !== "SW") && windows.length) notes.push("No window faces south, so winter sun cannot warm the rooms.");
  if (lat < 0 && windows.every((w) => w.sector !== "N" && w.sector !== "NE" && w.sector !== "NW") && windows.length) notes.push("No window faces north, so winter sun cannot warm the rooms.");
  return { dayLength: Math.round(dayLength(lat, n) * 10) / 10, windows, facades, notes };
}
export { SECTOR_NAMES, norm360 };
