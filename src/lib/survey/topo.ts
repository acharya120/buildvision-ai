import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";

/** Spot levels in plot coordinates: x right, y down (as in the plan), z = ground level in metres. */
export interface Spot { x: number; y: number; z: number }
export interface Grid { x0: number; y0: number; step: number; nx: number; ny: number; z: Float64Array }

/** Parse "x,y,z" lines (comma, space, tab or semicolon). Bad lines are reported, not guessed. */
export function parseSpots(text: string): { spots: Spot[]; errors: string[] } {
  const spots: Spot[] = [], errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const parts = t.split(/[,;\t ]+/).filter(Boolean);
    const nums = parts.map(Number);
    if (parts.length < 3 || nums.slice(0, 3).some((n) => !isFinite(n))) { if (i > 0 || nums.slice(0, 3).some((n) => isFinite(n))) errors.push(`Line ${i + 1} ignored: need three numbers x, y, level.`); return; }
    spots.push({ x: nums[0], y: nums[1], z: nums[2] });
  });
  return { spots, errors: errors.slice(0, 10) };
}

/** Inverse-distance weighting over the nearest points (power 2). Exact at the sample points; never outside the sample min/max. */
export function interpolate(spots: Spot[], x: number, y: number, k = 8): number | null {
  if (!spots.length) return null;
  const near = spots.map((s) => ({ s, d2: (s.x - x) ** 2 + (s.y - y) ** 2 })).sort((a, b) => a.d2 - b.d2).slice(0, k);
  if (near[0].d2 < 1e-12) return near[0].s.z;
  let num = 0, den = 0;
  for (const n of near) { const w = 1 / n.d2; num += w * n.s.z; den += w; }
  return num / den;
}

/** Terrain grid over the plot. Needs at least 3 spot levels. Cells are centred on (x0 + i*step, y0 + j*step). */
export function buildGrid(spots: Spot[], width: number, depth: number, cells = 60): Grid | null {
  if (spots.length < 3 || !(width > 0) || !(depth > 0)) return null;
  const step = Math.max(width, depth) / cells;
  const nx = Math.floor(width / step) + 1, ny = Math.floor(depth / step) + 1;
  const z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = interpolate(spots, i * step, j * step) ?? 0;
  return { x0: 0, y0: 0, step, nx, ny, z };
}

export interface Contour { level: number; segs: Array<[number, number, number, number]> }
/** Marching squares contour lines at a fixed interval (metres). */
export function contours(g: Grid, interval: number): Contour[] {
  if (!(interval > 0)) return [];
  let lo = Infinity, hi = -Infinity;
  for (const v of g.z) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const out: Contour[] = [];
  const at = (i: number, j: number) => g.z[j * g.nx + i];
  let start = Math.ceil(lo / interval) * interval;
  if (start <= lo + 1e-9) start += interval; // a contour exactly at the lowest ground level is not a line
  for (let lv = start; lv < hi - 1e-9; lv += interval) {
    const level = Math.round(lv * 1e6) / 1e6;
    const segs: Contour["segs"] = [];
    for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
      const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const px = [i, i + 1, i + 1, i], py = [j, j, j + 1, j + 1];
      const pts: Array<[number, number]> = [];
      for (let e = 0; e < 4; e++) {
        const a = c[e], b = c[(e + 1) % 4];
        // a sample exactly on the level counts as slightly below it, so contours along grid lines are not lost
        const lv = level + 1e-9;
        if ((a - lv) * (b - lv) < 0) { const t = (lv - a) / (b - a); pts.push([(px[e] + t * (px[(e + 1) % 4] - px[e])) * g.step + g.x0, (py[e] + t * (py[(e + 1) % 4] - py[e])) * g.step + g.y0]); }
      }
      if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
      else if (pts.length === 4) { segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]); segs.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]]); }
    }
    if (segs.length) out.push({ level, segs });
  }
  return out;
}

export interface SlopeStats { minPct: number; maxPct: number; meanPct: number; flatPct: number; moderatePct: number; steepPct: number; lowest: number; highest: number }
/** Slope = rise/run as a percentage, from central differences. Classes: <5% flat, 5-15% moderate, >15% steep (rule-of-thumb bands only). */
export function slopeStats(g: Grid): SlopeStats {
  let min = Infinity, max = 0, sum = 0, n = 0, flat = 0, mod = 0, steep = 0, lo = Infinity, hi = -Infinity;
  const at = (i: number, j: number) => g.z[Math.min(g.ny - 1, Math.max(0, j)) * g.nx + Math.min(g.nx - 1, Math.max(0, i))];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    // central difference inside, one-sided at the border (so edge cells are not under-counted)
    const i0 = Math.max(0, i - 1), i1 = Math.min(g.nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(g.ny - 1, j + 1);
    const dzdx = (at(i1, j) - at(i0, j)) / ((i1 - i0) * g.step || 1), dzdy = (at(i, j1) - at(i, j0)) / ((j1 - j0) * g.step || 1);
    const s = Math.hypot(dzdx, dzdy) * 100;
    min = Math.min(min, s); max = Math.max(max, s); sum += s; n++;
    if (s < 5) flat++; else if (s <= 15) mod++; else steep++;
    const z = at(i, j); lo = Math.min(lo, z); hi = Math.max(hi, z);
  }
  return { minPct: min, maxPct: max, meanPct: sum / n, flatPct: (flat / n) * 100, moderatePct: (mod / n) * 100, steepPct: (steep / n) * 100, lowest: lo, highest: hi };
}

export interface CutFill { cutM3: number; fillM3: number; netM3: number; areaM2: number; meanGround: number }
/** Volumes between the terrain and a flat formation level over the cells where `inside(x, y)` is true. cut = ground above level. */
export function cutFill(g: Grid, level: number, inside: (x: number, y: number) => boolean = () => true): CutFill {
  let cut = 0, fill = 0, area = 0, sum = 0;
  const cell = g.step * g.step;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = g.x0 + i * g.step, y = g.y0 + j * g.step;
    if (!inside(x, y)) continue;
    const z = g.z[j * g.nx + i];
    area += cell; sum += z;
    if (z > level) cut += (z - level) * cell; else fill += (level - z) * cell;
  }
  return { cutM3: cut, fillM3: fill, netM3: cut - fill, areaM2: area, meanGround: area ? sum / (area / cell) : 0 };
}

/** Cells under the ground-floor rooms (plus a margin), for building-pad earthwork. */
export function footprintMask(p: Project, margin = 0.5): (x: number, y: number) => boolean {
  const rects = (p.floors[0]?.rooms ?? []).filter(isValidRect);
  return (x, y) => rects.some((r) => x >= r.x - margin && x <= r.x + r.width + margin && y >= r.y - margin && y <= r.y + r.depth + margin);
}

export function contoursSvg(p: Project, g: Grid, interval: number, level: number | null): string {
  const W = p.plot.width, D = p.plot.depth, fs = Math.max(W, D) / 55, pad = fs * 2;
  const cs = contours(g, interval);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}" font-family="sans-serif"><rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${D + pad * 2}" fill="#fff"/><rect x="0" y="0" width="${W}" height="${D}" fill="#f4f7f2" stroke="#9aa3b2" stroke-width="${fs / 8}"/>`];
  for (const c of cs) for (const s of c.segs) out.push(`<line x1="${s[0].toFixed(3)}" y1="${s[1].toFixed(3)}" x2="${s[2].toFixed(3)}" y2="${s[3].toFixed(3)}" stroke="#8b5a2b" stroke-width="${fs / 10}"/>`);
  for (const c of cs) { const s = c.segs[Math.floor(c.segs.length / 2)]; out.push(`<text x="${s[0].toFixed(2)}" y="${s[1].toFixed(2)}" font-size="${fs * 0.8}" fill="#8b5a2b">${c.level}</text>`); }
  for (const r of (p.floors[0]?.rooms ?? []).filter(isValidRect)) out.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.depth}" fill="rgba(31,36,48,0.15)" stroke="#1f2430" stroke-width="${fs / 8}"/>`);
  out.push(`<text x="0" y="${-fs * 0.6}" font-size="${fs}" fill="#1f2430">Contours every ${interval} m${level != null ? `, formation level ${level} m` : ""}. Preliminary, interpolated from your spot levels, not a survey.</text></svg>`);
  return out.join("");
}
