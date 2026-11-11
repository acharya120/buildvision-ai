import type { Project } from "../model/types";
import { BRAND } from "../brand";
import { esc } from "../export/svg";
import { formatLength } from "../model/units";

export const INK = "#1f2430";
export const f2 = (n: number) => Math.round(n * 100) / 100;

export interface Body { svg: string; w: number; h: number }

/** Simple ruled table as an SVG group positioned at 0,0. */
export function tableSvg(title: string, head: string[], rows: string[][], widths: number[]): Body {
  const rh = 15;
  const w = widths.reduce((a, b) => a + b, 0);
  const out: string[] = [`<text x="0" y="11" font-size="11" font-weight="bold" fill="${INK}">${esc(title)}</text>`];
  let y = 18;
  const row = (cells: string[], bold: boolean, fill: string) => {
    out.push(`<rect x="0" y="${y}" width="${w}" height="${rh}" fill="${fill}" stroke="#c9ced8" stroke-width="0.6"/>`);
    let x = 0;
    cells.forEach((c, i) => {
      const max = Math.max(3, Math.floor(widths[i] / 5.2));
      const t = c.length > max ? c.slice(0, max - 1) + "…" : c;
      out.push(`<text x="${x + 4}" y="${y + 10.5}" font-size="9" ${bold ? 'font-weight="bold"' : ""} fill="${INK}">${esc(t)}</text>`);
      x += widths[i];
    });
    y += rh;
  };
  row(head, true, "#eef1f5");
  rows.forEach((r) => row(r, false, "#fff"));
  return { svg: out.join(""), w, h: y };
}

/** Wraps a drawing with optional tables, notes and a title block (same look as the structure sheets). */
export function frameSheet(p: Project, title: string, subtitle: string, draw: Body, tables: Body[], notes: string[]): string {
  const M = 36;
  const gap = 22;
  const W = Math.max(960, draw.w + M * 2);
  let tx = M;
  let ty = M + draw.h + gap;
  let rowH = 0;
  const placed: string[] = [];
  for (const t of tables) {
    if (tx + t.w > W - M && tx > M) {
      tx = M;
      ty += rowH + gap;
      rowH = 0;
    }
    placed.push(`<g transform="translate(${tx} ${ty})">${t.svg}</g>`);
    tx += t.w + gap;
    rowH = Math.max(rowH, t.h);
  }
  const bodyBottom = tables.length ? ty + rowH : M + draw.h;
  const noteY = bodyBottom + gap;
  const maxChars = Math.floor((W - M * 2) / 5.1);
  const lines = notes.flatMap((n) => {
    const out: string[] = [];
    let cur = "";
    for (const w of n.split(" ")) {
      if ((cur + " " + w).trim().length > maxChars) {
        out.push(cur);
        cur = w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) out.push(cur);
    return out;
  });
  const noteSvg = lines.map((n, i) => `<text x="${M}" y="${noteY + 12 + i * 14}" font-size="10" fill="#4b5263">${esc(n)}</text>`).join("");
  const tbY = noteY + lines.length * 14 + 16;
  const H = tbY + 92 + M;
  const fl = p.floors.length;
  const tb =
    `<rect x="${M}" y="${tbY}" width="${W - M * 2}" height="92" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` +
    `<line x1="${W - M - 250}" y1="${tbY}" x2="${W - M - 250}" y2="${tbY + 92}" stroke="${INK}" stroke-width="0.8"/>` +
    `<text x="${M + 10}" y="${tbY + 24}" font-size="16" font-weight="bold" fill="${INK}">${esc(title)}</text>` +
    `<text x="${M + 10}" y="${tbY + 42}" font-size="11" fill="#4b5263">${esc(subtitle)}</text>` +
    `<text x="${M + 10}" y="${tbY + 60}" font-size="11" fill="#4b5263">${esc(p.name)} - plot ${esc(formatLength(p.plot.width, p.unitSystem))} x ${esc(formatLength(p.plot.depth, p.unitSystem))} - ${fl} floor${fl === 1 ? "" : "s"}</text>` +
    `<text x="${M + 10}" y="${tbY + 80}" font-size="10" font-weight="bold" fill="#b91c1c">CONCEPTUAL ONLY - NOT AN APPROVED DRAWING - NOT FOR CONSTRUCTION</text>` +
    `<text x="${W - M - 240}" y="${tbY + 26}" font-size="13" font-weight="bold" fill="#136a52">${esc(BRAND.product)}</text>` +
    `<text x="${W - M - 240}" y="${tbY + 42}" font-size="10" fill="#4b5263">${esc(BRAND.credit)}</text>` +
    `<text x="${W - M - 240}" y="${tbY + 62}" font-size="10" fill="#4b5263">Date: ${new Date().toISOString().slice(0, 10)}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">` +
    `<title>${esc(p.name)} - ${esc(title)}</title><rect width="100%" height="100%" fill="#fff"/>` +
    `<rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    `<g transform="translate(${M + Math.max(0, (W - M * 2 - draw.w) / 2)} ${M})">${draw.svg}</g>${placed.join("")}${noteSvg}${tb}</svg>`
  );
}
