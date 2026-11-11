import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";

export interface TimelineOptions { startDate: string; daysPerWeek: 5 | 6; crew: number; weatherBufferPct: number }
export const DEFAULT_TIMELINE: TimelineOptions = { startDate: new Date().toISOString().slice(0, 10), daysPerWeek: 6, crew: 1, weatherBufferPct: 10 };
export interface Phase { id: string; name: string; days: number; after: string | null; lag: number; start: number; end: number; startDate: string; endDate: string; outdoor: boolean }

/** Add working days to a date (skips Sundays, and Saturdays too for a 5-day week). */
export function addWorkDays(iso: string, n: number, perWeek: 5 | 6): Date {
  const d = new Date(iso + "T00:00:00Z");
  let left = Math.max(0, Math.round(n));
  const isOff = (x: Date) => x.getUTCDay() === 0 || (perWeek === 5 && x.getUTCDay() === 6);
  while (isOff(d)) d.setUTCDate(d.getUTCDate() + 1);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isOff(d)) left--;
  }
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Preliminary construction schedule from rule-of-thumb productivity (working days grow with the built-up area).
 * Real durations depend on contractor, labour, material supply, weather and approvals. Replace with your contractor's programme.
 */
export function buildTimeline(p: Project, o: TimelineOptions): { phases: Phase[]; totalWorkDays: number; finish: string } {
  const crew = Math.min(4, Math.max(0.25, o.crew));
  const buf = 1 + Math.min(100, Math.max(0, o.weatherBufferPct)) / 100;
  const floorAreas = p.floors.map((f) => f.rooms.filter(isValidRect).reduce((s, r) => s + r.width * r.depth, 0));
  const built = floorAreas.reduce((a, b) => a + b, 0);
  const fp = Math.max(0, ...floorAreas);
  const openings = p.floors.reduce((s, f) => s + f.openings.length, 0);
  type Def = { id: string; name: string; base: number; after: string | null; lag: number; outdoor: boolean };
  const defs: Def[] = [{ id: "setup", name: "Approvals follow-up and site setup", base: 10, after: null, lag: 1, outdoor: false }];
  defs.push({ id: "found", name: "Excavation and foundation", base: 12 + 0.12 * fp, after: "setup", lag: 1, outdoor: true });
  defs.push({ id: "plinth", name: "Plinth beam and filling", base: 7 + 0.08 * fp, after: "found", lag: 1, outdoor: true });
  let prev = "plinth";
  p.floors.forEach((f, i) => {
    defs.push({ id: `slab${i}`, name: `Columns and slab - ${f.name}`, base: 18 + 0.12 * floorAreas[i], after: prev, lag: 1, outdoor: true });
    prev = `slab${i}`;
  });
  const last = prev;
  defs.push({ id: "mason", name: "Brick masonry", base: 8 + 0.2 * built, after: "slab0", lag: 0.7, outdoor: true });
  defs.push({ id: "roof", name: "Roof waterproofing and parapet", base: 6 + 0.05 * fp, after: last, lag: 1, outdoor: true });
  defs.push({ id: "mep", name: "Electrical and plumbing first fix", base: 8 + 0.08 * built, after: "mason", lag: 0.5, outdoor: false });
  defs.push({ id: "plaster", name: "Plastering", base: 8 + 0.18 * built, after: "mason", lag: 0.6, outdoor: false });
  defs.push({ id: "frames", name: "Door and window fixing", base: 4 + 0.25 * openings, after: "plaster", lag: 0.4, outdoor: false });
  defs.push({ id: "floor", name: "Flooring and tiling", base: 8 + 0.16 * built, after: "plaster", lag: 0.6, outdoor: false });
  defs.push({ id: "paint", name: "Painting", base: 6 + 0.12 * built, after: "floor", lag: 0.5, outdoor: false });
  defs.push({ id: "fit", name: "Fixtures, fittings and final electrical", base: 6 + 0.05 * built, after: "paint", lag: 0.7, outdoor: false });
  defs.push({ id: "handover", name: "Cleaning, snag list and handover", base: 4, after: "fit", lag: 1, outdoor: false });

  const phases: Phase[] = [];
  for (const d of defs) {
    const days = Math.max(1, Math.round((d.base / crew) * (d.outdoor ? buf : 1)));
    const pr = d.after ? phases.find((x) => x.id === d.after) : null;
    const start = pr ? Math.round(pr.start + pr.days * d.lag) : 0;
    phases.push({ id: d.id, name: d.name, days, after: d.after, lag: d.lag, start, end: start + days, startDate: iso(addWorkDays(o.startDate, start, o.daysPerWeek)), endDate: iso(addWorkDays(o.startDate, start + days, o.daysPerWeek)), outdoor: d.outdoor });
  }
  const total = Math.max(...phases.map((x) => x.end));
  return { phases, totalWorkDays: total, finish: iso(addWorkDays(o.startDate, total, o.daysPerWeek)) };
}
