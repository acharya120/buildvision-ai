import type { Project } from "../model/types";
import { BRAND } from "../brand";
import { DISCLAIMER } from "../export/disclaimer";
import { svgToPngBlob } from "../export/download";
import { sheetSvg } from "../structure/sheets";
import { ELEVATION_VIEWS, elevationSvg } from "./elevationSheet";
import { interiorSvg } from "./interiorSheet";
import { materialsSvg } from "./materialsSheet";

export interface PackOptions { elevations: boolean; interior: boolean; structure: boolean; site: boolean; materials: boolean }
export const DEFAULT_PACK: PackOptions = { elevations: true, interior: true, structure: false, site: true, materials: true };

export function packSheets(p: Project, o: PackOptions): Array<{ title: string; svg: string }> {
  const out: Array<{ title: string; svg: string }> = [];
  if (o.elevations) for (const v of ELEVATION_VIEWS) out.push({ title: v.label, svg: elevationSvg(p, v.id) });
  if (o.interior) for (const f of p.floors) out.push({ title: `Interior layout - ${f.name}`, svg: interiorSvg(p, f.id) });
  if (o.structure) {
    out.push({ title: "Columns", svg: sheetSvg(p, "columns") }, { title: "Footings", svg: sheetSvg(p, "footings") }, { title: "Section", svg: sheetSvg(p, "section") });
  }
  if (o.site) out.push({ title: "Site plan", svg: sheetSvg(p, "site") });
  if (o.materials) out.push({ title: "Material estimate", svg: materialsSvg(p) });
  return out;
}

const size = (svg: string): { w: number; h: number } => {
  const m = /width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/.exec(svg);
  return { w: m ? Number(m[1]) : 960, h: m ? Number(m[2]) : 680 };
};

/**
 * Extra A3 PDF: cover page, then each selected sheet drawn as a high-resolution image,
 * then the full disclaimer. The standard plan PDF in the Export tab is unchanged.
 */
export async function buildSheetPackPdf(p: Project, o: PackOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const PW = 420, PH = 297;
  doc.setFontSize(26);
  doc.text(p.name.slice(0, 60), 20, 40);
  doc.setFontSize(13);
  doc.text(`Detailed drawing pack - ${p.floors.length} floor(s) - plot ${p.plot.width} x ${p.plot.depth} m`.replace(/[^\x20-\x7E]/g, "?"), 20, 52);
  doc.text(`${BRAND.product} ${BRAND.credit}`, 20, 62);
  doc.text(new Date().toISOString().slice(0, 10), 20, 72);
  const sheets = packSheets(p, o);
  doc.setFontSize(11);
  sheets.forEach((s, i) => doc.text(`${i + 1}. ${s.title}`.replace(/[^\x20-\x7E]/g, "?"), 20, 90 + i * 7));
  for (const s of sheets) {
    const png = await svgToPngBlob(s.svg, 2);
    const url = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error("Could not read image."));
      fr.readAsDataURL(png);
    });
    const { w, h } = size(s.svg);
    const k = Math.min((PW - 20) / w, (PH - 20) / h);
    doc.addPage("a3", "landscape");
    doc.addImage(url, "PNG", (PW - w * k) / 2, (PH - h * k) / 2, w * k, h * k);
  }
  doc.addPage("a3", "landscape");
  doc.setFontSize(14);
  doc.text("Important notice", 20, 30);
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(DISCLAIMER, PW - 40), 20, 42);
  return doc.output("blob");
}
