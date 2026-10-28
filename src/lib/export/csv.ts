import type { Project } from "../model/types";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { buildEstimate } from "../estimate/estimate";
import { sqmToSqft } from "../model/units";
import { wallLength } from "../geometry/walls";

function cell(v: string | number | null | undefined): string {
  if (v == null) return "";
  let s = String(v);
  // neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows: Array<Array<string | number | null | undefined>>) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export function roomScheduleCsv(p: Project): string {
  const rows: Array<Array<string | number>> = [
    ["Floor", "Room", "Type", "X (m)", "Y (m)", "Width (m)", "Depth (m)", "Area (m2)", "Area (sq ft)"],
  ];
  for (const f of p.floors)
    for (const r of f.rooms) {
      const a = r.width * r.depth;
      rows.push([f.name, r.name, ROOM_TYPE_LABELS[r.type], r.x.toFixed(3), r.y.toFixed(3), r.width.toFixed(3), r.depth.toFixed(3), a.toFixed(2), sqmToSqft(a).toFixed(1)]);
    }
  return toCsv(rows);
}

export function openingScheduleCsv(p: Project): string {
  const rows: Array<Array<string | number>> = [["Floor", "Type", "Wall length (m)", "Offset (m)", "Width (m)", "Height (m)", "Sill (m)"]];
  for (const f of p.floors)
    for (const o of f.openings) {
      const w = f.walls.find((x) => x.id === o.wallId);
      rows.push([f.name, o.kind === "door" ? "Door" : "Window", w ? wallLength(w).toFixed(2) : "missing wall", o.offset.toFixed(3), o.width.toFixed(2), o.height.toFixed(2), o.sill.toFixed(2)]);
    }
  return toCsv(rows);
}

export function estimateCsv(p: Project): string {
  const e = buildEstimate(p);
  const rows: Array<Array<string | number | null>> = [["Item", "Quantity", "Unit", "Rate (user-entered)", "Amount", "Basis", "Calculation basis / assumptions"]];
  for (const l of e.lines) rows.push([l.name, l.quantity, l.unit, l.rate, l.amount, l.basis, l.note]);
  rows.push([]);
  rows.push(["Total of rated items", "", "", "", e.totalCost]);
  rows.push([]);
  rows.push(["Not estimated"]);
  for (const u of e.unavailable) rows.push([u]);
  rows.push([]);
  rows.push(["Preliminary estimate only. Rates are entered by the user and are not verified quotations."]);
  return toCsv(rows);
}
