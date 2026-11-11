import type { Project } from "../model/types";
import { buildTakeoff } from "../materials/takeoff";
import { formatArea } from "../model/units";
import { frameSheet, tableSvg } from "./frame";

export function materialsSvg(p: Project): string {
  const t = buildTakeoff(p);
  const cur = p.settings.estimate.currency;
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const rows = t.lines.map((l) => [l.group, l.name, n(l.quantity), l.unit, l.rate != null ? `${cur}${n(l.rate)}` : "-", l.amount != null ? `${cur}${n(l.amount)}` : "-"]);
  const table = tableSvg("Material take-off", ["Group", "Item", "Qty", "Unit", "Rate", "Amount"], rows, [110, 330, 80, 60, 80, 100]);
  const totals = tableSvg("Cost summary", ["Item", "Amount"], [["Materials (rated items)", `${cur}${n(t.materialTotal)}`], ["Labour", `${cur}${n(t.labour)}`], ["Contingency", `${cur}${n(t.contingency)}`], ["Tax", `${cur}${n(t.tax)}`], ["Grand total", `${cur}${n(t.grandTotal)}`], ["Per m² built-up", t.perSqm != null ? `${cur}${n(t.perSqm)}` : "-"], ["Per sq ft built-up", t.perSqft != null ? `${cur}${n(t.perSqft)}` : "-"]], [170, 120]);
  const notes = [...t.notes, t.unrated.length ? `${t.unrated.length} item(s) have no rate entered yet, so totals are incomplete.` : "All items have a rate."];
  return frameSheet(p, "Material estimate", `Built-up area ${formatArea(t.builtUp, p.unitSystem)} - rates entered by the user`, { svg: "", w: 0, h: 0 }, [table, totals], notes);
}
