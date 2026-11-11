import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { edgeWalls, roomOpenings } from "../review/roomEdges";
import { angDiff, edgeBearing, sectorOf, type Sector } from "../analysis/compass";
import { dayOfYear, sunPosition } from "../analysis/sun";

export interface EnvelopeSet { uWall: number; uRoof: number; uWindow: number; shgc: number }
export interface EnergyInputs {
  lat: number; month: number; day: number;
  tOut: number; tIn: number; roofExtraK: number;
  directNormal: number; diffuse: number; shading: number;
  current: EnvelopeSet; improved: EnvelopeSet;
  cop: number; eflh: number;
  pvUsablePct: number; m2PerKwp: number; kwhPerKwpYear: number;
}
/** Starting values you can edit: typical orders of magnitude for plastered brick walls, RCC roofs and clear/low-e glass. */
export const DEFAULT_ENERGY: EnergyInputs = {
  lat: 20, month: 5, day: 21, tOut: 40, tIn: 26, roofExtraK: 15, directNormal: 800, diffuse: 100, shading: 1,
  current: { uWall: 2.0, uRoof: 2.6, uWindow: 5.8, shgc: 0.7 },
  improved: { uWall: 0.6, uRoof: 0.5, uWindow: 2.8, shgc: 0.4 },
  cop: 3, eflh: 1500, pvUsablePct: 40, m2PerKwp: 6, kwhPerKwpYear: 1400,
};

export interface FacadeEnergy { sector: Sector; wallArea: number; windowArea: number; wwrPct: number; peakSolarW: number; dailySolarKwhPerM2: number }
export interface EnergyResult {
  facades: FacadeEnergy[];
  wallArea: number; windowArea: number; roofArea: number; floorArea: number; wwrPct: number;
  conductionW: number; peakSolarW: number; peakHour: number;
  peakKw: number; tonnage: number;
  improvedPeakKw: number; savingPct: number;
  annualCoolingKwh: number; improvedAnnualKwh: number;
  pvKwp: number; pvAnnualKwh: number; pvOffsetPct: number;
}

function verticalIrradiance(lat: number, n: number, hour: number, bearing: number, inp: EnergyInputs): number {
  const s = sunPosition(lat, n, hour);
  const diffuse = inp.diffuse * 0.5;
  if (s.altitude <= 3) return 0;
  const cosT = Math.cos((s.altitude * Math.PI) / 180) * Math.cos((angDiff(s.azimuth, bearing) * Math.PI) / 180);
  return inp.directNormal * Math.max(0, cosT) + diffuse;
}

export function computeEnergy(p: Project, inp: EnergyInputs): EnergyResult {
  const north = p.northAngle ?? 0;
  const n = dayOfYear(inp.month, inp.day);
  const bySector = new Map<Sector, { wall: number; win: number; bearing: number }>();
  let floorArea = 0;
  for (const f of p.floors) {
    for (const r of f.rooms.filter(isValidRect)) {
      floorArea += r.width * r.depth;
      const ops = roomOpenings(f, r);
      for (const e of edgeWalls(f, r).filter((q) => q.exterior)) {
        const bearing = edgeBearing(e.side, north);
        const sec = sectorOf(bearing);
        const here = ops.filter((o) => o.edge === e || (o.edge.wall.id === e.wall.id && o.edge.side === e.side));
        const openingArea = here.reduce((s, o) => s + o.opening.width * o.opening.height, 0);
        const winArea = here.filter((o) => o.opening.kind === "window").reduce((s, o) => s + o.opening.width * o.opening.height, 0);
        const gross = (e.to - e.from) * f.height;
        const cur = bySector.get(sec) ?? { wall: 0, win: 0, bearing };
        cur.wall += Math.max(0, gross - openingArea);
        cur.win += winArea;
        bySector.set(sec, cur);
      }
    }
  }
  const roofArea = Math.max(0, ...p.floors.map((f) => f.rooms.filter(isValidRect).reduce((s, r) => s + r.width * r.depth, 0)));
  const hours: number[] = [];
  for (let h = 6; h <= 18; h += 0.5) hours.push(h);
  const facades: FacadeEnergy[] = [...bySector.entries()].map(([sector, v]) => {
    const irr = hours.map((h) => verticalIrradiance(inp.lat, n, h, v.bearing, inp));
    return { sector, wallArea: v.wall, windowArea: v.win, wwrPct: v.wall + v.win > 0 ? (v.win / (v.wall + v.win)) * 100 : 0, peakSolarW: Math.max(...irr) * v.win * inp.current.shgc * inp.shading, dailySolarKwhPerM2: (irr.reduce((a, b) => a + b, 0) * 0.5) / 1000 };
  });
  const wallArea = facades.reduce((s, f) => s + f.wallArea, 0);
  const windowArea = facades.reduce((s, f) => s + f.windowArea, 0);
  const dT = Math.max(0, inp.tOut - inp.tIn);
  const load = (env: EnvelopeSet) => {
    const conduction = env.uWall * wallArea * dT + env.uWindow * windowArea * dT + env.uRoof * roofArea * (dT + inp.roofExtraK);
    let best = 0, bestH = 12;
    for (const h of hours) {
      let solar = 0;
      for (const [, v] of bySector) solar += verticalIrradiance(inp.lat, n, h, v.bearing, inp) * v.win * env.shgc * inp.shading;
      if (solar > best) { best = solar; bestH = h; }
    }
    return { conduction, solar: best, hour: bestH, kw: (conduction + best) / 1000 };
  };
  const cur = load(inp.current), imp = load(inp.improved);
  const annual = (kw: number) => (kw * inp.eflh) / Math.max(0.5, inp.cop);
  const pvKwp = (roofArea * (inp.pvUsablePct / 100)) / Math.max(1, inp.m2PerKwp);
  const pvAnnual = pvKwp * inp.kwhPerKwpYear;
  return {
    facades, wallArea, windowArea, roofArea, floorArea, wwrPct: wallArea + windowArea > 0 ? (windowArea / (wallArea + windowArea)) * 100 : 0,
    conductionW: cur.conduction, peakSolarW: cur.solar, peakHour: cur.hour, peakKw: cur.kw, tonnage: (cur.kw * 1.1) / 3.517,
    improvedPeakKw: imp.kw, savingPct: cur.kw > 0 ? ((cur.kw - imp.kw) / cur.kw) * 100 : 0,
    annualCoolingKwh: annual(cur.kw), improvedAnnualKwh: annual(imp.kw),
    pvKwp, pvAnnualKwh: pvAnnual, pvOffsetPct: annual(cur.kw) > 0 ? (pvAnnual / annual(cur.kw)) * 100 : 0,
  };
}
