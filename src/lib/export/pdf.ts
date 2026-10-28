import type { Project } from "../model/types";
import { ROOM_COLORS, ROOM_TYPE_LABELS } from "../model/defaults";
import { formatArea, formatLength, formatPlotArea } from "../model/units";
import { isValidRect } from "../geometry/rect";
import { openingGeometry, wallPolygon } from "../geometry/walls";
import { buildEstimate } from "../estimate/estimate";
import { DISCLAIMER } from "./disclaimer";
import { niceScaleBar } from "./svg";

/** jsPDF's built-in fonts cannot print every symbol (e.g. the rupee sign), so map to safe text. */
const safe = (s: string) =>
  s
    .replace(/₹/g, "Rs ")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[×·]/g, "x")
    .replace(/[^\x20-\x7E]/g, "?");

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/**
 * Printable A3 landscape PDF made of REAL vector drawing (not a screenshot):
 * one dimensioned plan sheet per floor (plot, rooms, walls, openings, dimensions, scale bar, title block)
 * followed by a room schedule / estimate summary page and the full safety disclaimer.
 */
export async function buildPdf(p: Project): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const PW = 420;
  const PH = 297;
  const sys = p.unitSystem;

  p.floors.forEach((floor, fi) => {
    if (fi > 0) doc.addPage();
    const maxPlan = { w: PW - 90, h: PH - 120 };
    const s = Math.min(maxPlan.w / p.plot.width, maxPlan.h / p.plot.depth); // mm per metre
    const ox = (PW - p.plot.width * s) / 2;
    const oy = 38;
    const X = (m: number) => ox + m * s;
    const Y = (m: number) => oy + m * s;

    doc.setDrawColor(31, 36, 48);
    doc.setLineWidth(0.4);
    doc.rect(8, 8, PW - 16, PH - 16);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(safe(`${p.name} - ${floor.name}`), 14, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(safe(`Dimensioned floor plan (conceptual)  |  Units: ${sys}  |  Date: ${new Date().toISOString().slice(0, 10)}`), 14, 26);

    // plot boundary
    doc.setDrawColor(192, 57, 43);
    doc.setLineWidth(0.5);
    doc.rect(X(0), Y(0), p.plot.width * s, p.plot.depth * s);

    // rooms
    doc.setLineWidth(0.15);
    doc.setDrawColor(107, 114, 128);
    for (const r of floor.rooms.filter(isValidRect)) {
      const [cr, cg, cb] = hex(ROOM_COLORS[r.type]);
      doc.setFillColor(cr, cg, cb);
      doc.rect(X(r.x), Y(r.y), r.width * s, r.depth * s, "FD");
    }
    // walls
    doc.setFillColor(43, 47, 58);
    for (const w of floor.walls) {
      const pts = wallPolygon(w);
      const rel = pts.slice(1).map((pt, i) => [pt.x * s - pts[i].x * s, pt.y * s - pts[i].y * s]);
      doc.lines(rel, X(pts[0].x), Y(pts[0].y), [1, 1], "F", true);
    }
    // openings
    for (const o of floor.openings) {
      const w = floor.walls.find((q) => q.id === o.wallId);
      if (!w) continue;
      const g = openingGeometry(w, o);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(Math.max(0.6, w.thickness * s + 0.2));
      doc.line(X(g.p0.x), Y(g.p0.y), X(g.p1.x), Y(g.p1.y));
      if (o.kind === "door") {
        doc.setDrawColor(43, 47, 58);
        doc.setLineWidth(0.25);
        const leaf = { x: g.p0.x + g.normal.x * o.width, y: g.p0.y + g.normal.y * o.width };
        doc.line(X(g.p0.x), Y(g.p0.y), X(leaf.x), Y(leaf.y));
        // quarter-circle swing drawn as short segments
        let prev = leaf;
        for (let k = 1; k <= 10; k++) {
          const a = (k / 10) * (Math.PI / 2);
          const pt = {
            x: g.p0.x + g.normal.x * o.width * Math.cos(a) + g.dir.x * o.width * Math.sin(a),
            y: g.p0.y + g.normal.y * o.width * Math.cos(a) + g.dir.y * o.width * Math.sin(a),
          };
          doc.line(X(prev.x), Y(prev.y), X(pt.x), Y(pt.y));
          prev = pt;
        }
      } else {
        doc.setDrawColor(43, 108, 176);
        doc.setLineWidth(0.25);
        doc.line(X(g.p0.x), Y(g.p0.y), X(g.p1.x), Y(g.p1.y));
      }
    }
    // labels
    doc.setTextColor(31, 36, 48);
    for (const r of floor.rooms.filter(isValidRect)) {
      const cx = X(r.x + r.width / 2);
      const cy = Y(r.y + r.depth / 2);
      const fs = Math.max(6, Math.min(11, (r.width * s) / 6));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fs);
      doc.text(safe(r.name), cx, cy - 1, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fs * 0.8);
      doc.text(safe(`${formatLength(r.width, sys)} x ${formatLength(r.depth, sys)}`), cx, cy + fs * 0.35, { align: "center" });
      doc.text(safe(formatArea(r.width * r.depth, sys)), cx, cy + fs * 0.7 + 1, { align: "center" });
    }
    // plot dimensions
    doc.setDrawColor(122, 61, 0);
    doc.setTextColor(122, 61, 0);
    doc.setLineWidth(0.2);
    doc.setFontSize(9);
    doc.line(X(0), Y(0) - 8, X(p.plot.width), Y(0) - 8);
    doc.text(safe(`Plot width ${formatLength(p.plot.width, sys)}`), X(p.plot.width / 2), Y(0) - 10, { align: "center" });
    doc.line(X(0) - 8, Y(0), X(0) - 8, Y(p.plot.depth));
    doc.text(safe(`Plot depth ${formatLength(p.plot.depth, sys)}`), X(0) - 10, Y(p.plot.depth / 2), { align: "center", angle: 90 });
    for (const d of floor.dimensions) {
      doc.line(X(d.x1), Y(d.y1), X(d.x2), Y(d.y2));
      doc.text(safe(formatLength(Math.hypot(d.x2 - d.x1, d.y2 - d.y1), sys)), (X(d.x1) + X(d.x2)) / 2, (Y(d.y1) + Y(d.y2)) / 2 - 1.5, { align: "center" });
    }
    // scale bar
    const bar = niceScaleBar(Math.max(p.plot.width, p.plot.depth), sys);
    doc.setDrawColor(31, 36, 48);
    doc.setTextColor(31, 36, 48);
    doc.setLineWidth(0.5);
    const by = Y(p.plot.depth) + 8;
    doc.line(X(0), by, X(0) + bar.meters * s, by);
    doc.line(X(0), by - 1.5, X(0), by + 1.5);
    doc.line(X(0) + bar.meters * s, by - 1.5, X(0) + bar.meters * s, by + 1.5);
    doc.setFontSize(8);
    doc.text(safe(`${bar.label}   (drawing scale about 1:${Math.round(1000 / s)} on A3)`), X(0), by + 5);

    // footer
    doc.setFontSize(7);
    doc.setTextColor(160, 32, 32);
    doc.text(safe("Conceptual drawing only - not an approved architectural or structural drawing. See the disclaimer page."), 14, PH - 12);
    doc.setTextColor(0, 0, 0);
  });

  // ---- schedule & estimate page ----
  doc.addPage();
  let y = 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(safe(`${p.name} - schedules and preliminary estimate`), 14, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(safe(`Plot ${formatLength(p.plot.width, sys)} x ${formatLength(p.plot.depth, sys)} (${formatPlotArea(p.plot.width * p.plot.depth)})`), 14, y);
  y += 8;

  const colX = [14, 60, 130, 170, 215, 260];
  const header = (cols: string[]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    cols.forEach((c, i) => doc.text(safe(c), colX[i], y));
    doc.setFont("helvetica", "normal");
    y += 2;
    doc.line(14, y, 400, y);
    y += 5;
  };
  const ensure = (need: number) => {
    if (y + need > PH - 20) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.text("Room schedule", 14, y);
  y += 6;
  header(["Floor", "Room", "Type", "Width x Depth", "Area"]);
  for (const f of p.floors)
    for (const r of f.rooms) {
      ensure(6);
      doc.setFontSize(9);
      doc.text(safe(f.name), colX[0], y);
      doc.text(safe(r.name), colX[1], y);
      doc.text(safe(ROOM_TYPE_LABELS[r.type]), colX[2], y);
      doc.text(safe(`${formatLength(r.width, sys)} x ${formatLength(r.depth, sys)}`), colX[3], y);
      doc.text(safe(formatArea(r.width * r.depth, sys)), colX[4], y);
      y += 5;
    }

  const openings = p.floors.flatMap((f) => f.openings.map((o) => ({ f, o })));
  if (openings.length) {
    y += 6;
    ensure(20);
    doc.setFont("helvetica", "bold");
    doc.text("Door and window schedule", 14, y);
    y += 6;
    header(["Floor", "Type", "Width", "Height", "Sill"]);
    for (const { f, o } of openings) {
      ensure(6);
      doc.text(safe(f.name), colX[0], y);
      doc.text(o.kind === "door" ? "Door" : "Window", colX[1], y);
      doc.text(safe(formatLength(o.width, sys)), colX[2], y);
      doc.text(safe(formatLength(o.height, sys)), colX[3], y);
      doc.text(safe(formatLength(o.sill, sys)), colX[4], y);
      y += 5;
    }
  }

  const est = buildEstimate(p);
  y += 6;
  ensure(30);
  doc.setFont("helvetica", "bold");
  doc.text("Preliminary quantity estimate (rates are user-entered, not verified quotations)", 14, y);
  y += 6;
  const ex = [14, 110, 145, 170, 205, 245];
  doc.setFontSize(9);
  ["Item", "Quantity", "Unit", "Rate", "Amount", "Basis"].forEach((c, i) => doc.text(c, ex[i], y));
  doc.setFont("helvetica", "normal");
  y += 2;
  doc.line(14, y, 400, y);
  y += 5;
  const cur = safe(p.settings.estimate.currency);
  for (const l of est.lines) {
    ensure(6);
    doc.text(safe(l.name), ex[0], y);
    doc.text(String(l.quantity), ex[1], y);
    doc.text(safe(l.unit), ex[2], y);
    doc.text(l.rate != null ? `${cur}${l.rate}` : "-", ex[3], y);
    doc.text(l.amount != null ? `${cur}${l.amount.toLocaleString("en-US")}` : "-", ex[4], y);
    doc.text(l.basis, ex[5], y);
    y += 5;
  }
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.text(safe(`Total of rated items: ${cur}${est.totalCost.toLocaleString("en-US")}`), 14, y);
  y += 8;

  ensure(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Safety disclaimer", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const wrapped = doc.splitTextToSize(safe(DISCLAIMER), PW - 28) as string[];
  for (const line of wrapped) {
    ensure(5);
    doc.text(line, 14, y);
    y += 4;
  }
  return doc.output("blob");
}
