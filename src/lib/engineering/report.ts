import type { Project } from "../model/types";
import { isValidRect } from "../geometry/rect";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { designMetrics } from "../analysis/compare";
import { buildTakeoff } from "../materials/takeoff";
import { reviewProject, reviewSummary } from "../review/review";
import { vastuCheck } from "../analysis/vastu";
import { EMPTY_RULES, checkCompliance, complianceSummary, type Rules } from "../analysis/compliance";
import { readStored } from "../analysis/useStored";
import { DEFAULT_CARBON, computeCarbon } from "./carbon";
import { DEFAULT_ENERGY, computeEnergy } from "./energy";
import { EXAMPLE_ACCESS, checkAccessibility } from "./accessibility";
import { EMPTY_FIRE, fireAnalysis } from "./fire";
import { detectClashes } from "./clash";
import { PRELIM } from "./prelim";

export interface ReportSection { title: string; rows: Array<[string, string]>; note?: string }
export interface ChartBar { label: string; value: number }
export interface ProjectReport {
  title: string;
  generated: string;
  sections: ReportSection[];
  charts: { areaByType: ChartBar[]; carbonByMaterial: ChartBar[]; costByGroup: ChartBar[]; issues: ChartBar[] };
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-US");
const status = (c: Array<{ status: string }>) => { const f = c.filter((x) => x.status === "fail").length, p = c.filter((x) => x.status === "pass").length, ns = c.filter((x) => x.status === "not set").length; return { f, p, ns }; };

export function buildReport(p: Project): ProjectReport {
  const m = designMetrics(p);
  const t = buildTakeoff(p);
  const cur = p.settings.estimate.currency;
  const rv = reviewSummary(reviewProject(p));
  const vs = vastuCheck(p);
  const rules = readStored<Rules>(p.id, "rules", EMPTY_RULES);
  const comp = complianceSummary(checkCompliance(p, rules));
  const carbon = computeCarbon(p, readStored(p.id, "carbon", DEFAULT_CARBON));
  const energy = computeEnergy(p, readStored(p.id, "energy", DEFAULT_ENERGY));
  const acc = status(checkAccessibility(p, readStored(p.id, "access", EXAMPLE_ACCESS)));
  const fire = fireAnalysis(p, readStored(p.id, "fire", EMPTY_FIRE));
  const fs = status(fire.checks);
  const clashes = detectClashes(p);
  const byType = new Map<string, number>();
  for (const r of p.floors.flatMap((f) => f.rooms.filter(isValidRect))) byType.set(ROOM_TYPE_LABELS[r.type], (byType.get(ROOM_TYPE_LABELS[r.type]) ?? 0) + r.width * r.depth);
  const byGroup = new Map<string, number>();
  for (const l of t.lines) if (l.amount != null) byGroup.set(l.group, (byGroup.get(l.group) ?? 0) + l.amount);
  const sections: ReportSection[] = [
    { title: "Project", rows: [["Name", p.name], ["Plot", `${p.plot.width} x ${p.plot.depth} m`], ["Floors", String(m.floors)], ["Room area", `${n1(m.builtUp)} m²`], ["Rooms / bedrooms / bathrooms", `${m.rooms} / ${m.bedrooms} / ${m.bathrooms}`], ["Ground coverage / FAR", `${n1(m.coveragePct)}% / ${m.far.toFixed(2)}`]] },
    { title: "Cost", rows: [["Estimated total (your rates)", t.materialTotal > 0 ? `${cur}${Math.round(t.grandTotal).toLocaleString("en-US")}` : "enter rates in Materials"], ["Items without a rate", String(t.unrated.length)]] },
    { title: "Carbon", rows: [["Embodied carbon", `${n1(carbon.embodiedKg / 1000)} tCO2e`], ["Per m² built-up", `${n1(carbon.perSqm)} kgCO2e/m²`], ["Largest source", carbon.lines[0] ? `${carbon.lines[0].label} (${n1(carbon.lines[0].sharePct)}%)` : "-"]], note: "Indicative factors; replace with product EPDs." },
    { title: "Energy (envelope only)", rows: [["Peak envelope cooling load", `${n1(energy.peakKw)} kW (about ${n1(energy.tonnage)} TR)`], ["Window-to-wall ratio", `${n1(energy.wwrPct)}%`], ["Saving with improved envelope", `${n1(energy.savingPct)}%`], ["Roof PV potential", `${n1(energy.pvKwp)} kWp`]] },
    { title: "Design checks", rows: [["Design review: attention / advice", `${rv.attention} / ${rv.advice}`], ["Vastu favoured placements", `${vs.favoured} of ${vs.rated}`], ["Regulation self-check: pass / fail / not set", `${comp.pass} / ${comp.fail} / ${comp.notSet}`], ["Accessibility: pass / fail", `${acc.p} / ${acc.f}`], ["Fire safety: pass / fail", `${fs.p} / ${fs.f}`], ["Coordination clashes (high / medium / info)", `${clashes.filter((c) => c.severity === "high").length} / ${clashes.filter((c) => c.severity === "medium").length} / ${clashes.filter((c) => c.severity === "info").length}`]], note: "Fire, accessibility, regulation and clash results come from your own limits and simple geometry. They are not certified." },
  ];
  return {
    title: p.name, generated: new Date().toISOString().slice(0, 10), sections,
    charts: {
      areaByType: [...byType].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      carbonByMaterial: carbon.lines.map((l) => ({ label: l.label, value: l.kg })),
      costByGroup: [...byGroup].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      issues: [{ label: "Review", value: rv.attention + rv.advice }, { label: "Regulation fails", value: comp.fail }, { label: "Accessibility fails", value: acc.f }, { label: "Fire fails", value: fs.f }, { label: "Clashes", value: clashes.length }],
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Self-contained HTML report (prints to PDF from any browser). */
export function reportHtml(r: ProjectReport): string {
  const sec = r.sections.map((s) => `<h2>${esc(s.title)}</h2><table>${s.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>${s.note ? `<p class="n">${esc(s.note)}</p>` : ""}`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)} - project report</title><style>body{font:14px Arial,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#1f2430}h1{font-size:22px}h2{font-size:16px;margin-top:24px;border-bottom:1px solid #ccd;padding-bottom:4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d5d9e2;padding:6px 8px;text-align:left}th{width:55%;background:#f4f6fa;font-weight:600}.n{font-size:12px;color:#4b5263}.w{margin-top:28px;padding:10px;border:1px solid #f0c36b;background:#fff8e6;font-size:12px}</style></head><body><h1>${esc(r.title)}</h1><p>Project report - ${esc(r.generated)}</p>${sec}<p class="w"><strong>Important.</strong> ${esc(PRELIM)} Conceptual design tool. Not an approved architectural or structural drawing.</p></body></html>`;
}
export function reportCsv(r: ProjectReport): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return `# ${r.title} - project report ${r.generated}\n# ${PRELIM}\nSection,Item,Value\n` + r.sections.flatMap((s) => s.rows.map(([k, v]) => [q(s.title), q(k), q(v)].join(","))).join("\n");
}
