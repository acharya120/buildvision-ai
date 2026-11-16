import type { Project } from "../model/types";
import { planToSvg, esc } from "./svg";
import { DISCLAIMER_SHORT } from "./disclaimer";
import { BRAND } from "../brand";
import { LABEL_FONT_STACK, floorLabel, type LabelLang } from "../i18n/labels";

export interface SheetOptions {
  lang?: LabelLang;
  /** "bright" = yellow walls and blue names; default "bright" for sheets */
  style?: "classic" | "bright";
  /** width and depth arrows inside every room, area, stair treads and UP / DOWN (default true) */
  detailed?: boolean;
  /** draw furniture symbols (default false, for a cleaner sheet) */
  furniture?: boolean;
  /** pixels per metre for every floor (default 38) */
  scale?: number;
  /** floors per row (default 2 when there is more than one floor) */
  columns?: number;
}

/**
 * One sheet with EVERY floor, each fully labelled, so the whole building can be read at a glance and shared as one
 * picture. Built from the same per-floor drawing as the normal export, plus a heading, a floor title per floor and the
 * preliminary-concept note.
 */
export function planSheetSvg(p: Project, opts: SheetOptions = {}): string {
  const lang = opts.lang ?? "en";
  const n = p.floors.length;
  const cols = Math.max(1, Math.min(opts.columns ?? (n > 1 ? 2 : 1), Math.max(1, n)));
  const pad = 24, headH = 74, titleH = 46, footH = 52;
  const cells = p.floors.map((f, i) => {
    const svg = planToSvg(p, f.id, {
      showTitleBlock: false, showGrid: false, showSite: true, fullPlot: true, scale: opts.scale ?? 38,
      lang, detailed: opts.detailed !== false, style: opts.style ?? "bright",
      layers: { grid: false, dimensions: true, furniture: opts.furniture === true },
    });
    const m = svg.match(/<svg [^>]*?width="([\d.]+)" height="([\d.]+)"/);
    const w = m ? parseFloat(m[1]) : 640, h = m ? parseFloat(m[2]) : 480;
    return { svg, w, h, title: floorLabel(f.name, i, lang) };
  });
  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...rows.map((r) => r[c]?.w ?? 0)));
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.h)));
  const bodyW = colW.reduce((a, b) => a + b, 0) + pad * (cols - 1);
  const W = Math.max(bodyW + pad * 2, 720);
  const H = headH + rowH.reduce((a, h) => a + h + titleH, 0) + pad * Math.max(0, rows.length - 1) + footH + pad;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round(H)}" viewBox="0 0 ${W} ${Math.round(H)}" font-family="${lang === "en" ? "Arial, Helvetica, sans-serif" : LABEL_FONT_STACK}">`);
  out.push(`<title>${esc(p.name)}</title><rect width="100%" height="100%" fill="#ffffff"/>`);
  out.push(`<text x="${W / 2}" y="40" font-size="26" font-weight="bold" text-anchor="middle" fill="#111827">${esc(p.name)}</text>`);
  out.push(`<text x="${W / 2}" y="62" font-size="12" text-anchor="middle" fill="#4b5563">${n} ${n === 1 ? "floor" : "floors"} - plot ${p.plot.width} x ${p.plot.depth} m</text>`);
  let y = headH;
  rows.forEach((r, ri) => {
    let x = pad + (W - pad * 2 - bodyW) / 2;
    r.forEach((c, ci) => {
      const cx = x + colW[ci] / 2;
      out.push(`<text x="${cx}" y="${y + 30}" font-size="22" font-weight="bold" text-anchor="middle" fill="#1a3fd0">${esc(c.title)}</text>`);
      out.push(c.svg.replace('<svg xmlns="http://www.w3.org/2000/svg"', `<svg x="${Math.round(x + (colW[ci] - c.w) / 2)}" y="${y + titleH}"`));
      x += colW[ci] + pad;
    });
    y += rowH[ri] + titleH + pad;
  });
  out.push(`<text x="${pad}" y="${H - 30}" font-size="11" fill="#a02020">${esc(DISCLAIMER_SHORT)}</text>`);
  out.push(`<text x="${W - pad}" y="${H - 12}" font-size="10" text-anchor="end" fill="#434b5f">${esc(BRAND.credit)}</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}
