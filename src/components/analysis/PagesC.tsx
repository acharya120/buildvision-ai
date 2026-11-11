"use client";

import { useEffect, useMemo, useState } from "react";
import { computeRoi, type RoiInput } from "@/lib/analysis/roi";
import { EMPTY_RULES, EXAMPLE_RULES, checkCompliance, complianceSummary, type Rules } from "@/lib/analysis/compliance";
import { designMetrics, spaceHints, type Metrics } from "@/lib/analysis/compare";
import { buildTakeoff } from "@/lib/materials/takeoff";
import { loadSnapshots, snapshotProject } from "@/lib/history/history";
import { listProjects } from "@/lib/storage/local";
import { planToSvg } from "@/lib/export/svg";
import { useStored } from "@/lib/analysis/useStored";
import { useWorkspace } from "@/lib/state/store";
import type { Project } from "@/lib/model/types";
import { btn, NumberField } from "../ui/Field";
import { Card, Chip } from "../studio/shared";
import { Pill, Prelim, Stat } from "./common";

const ROI_DEFAULT: RoiInput = { land: 0, construction: 0, otherCostPct: 0, marketValue: 0, monthlyRent: 0, occupancyPct: 90, maintenancePct: 1, propertyTaxYear: 0, appreciationPct: 0, rentGrowthPct: 0, years: 10, sellingCostPct: 0, loanAmount: 0, loanRatePct: 0, loanYears: 20, discountPct: 8 };
const ROI_FIELDS: Array<[keyof RoiInput, string]> = [
  ["land", "Land cost"], ["construction", "Construction cost"], ["otherCostPct", "Registration, approvals, fees %"], ["marketValue", "Market value of finished property today"],
  ["monthlyRent", "Monthly rent"], ["occupancyPct", "Occupancy %"], ["maintenancePct", "Yearly upkeep % of construction"], ["propertyTaxYear", "Property tax per year"],
  ["appreciationPct", "Value growth % per year"], ["rentGrowthPct", "Rent growth % per year"], ["years", "Holding period (years)"], ["sellingCostPct", "Selling cost %"],
  ["loanAmount", "Loan amount"], ["loanRatePct", "Loan interest % per year"], ["loanYears", "Loan term (years)"], ["discountPct", "Your required return % (for NPV)"],
];

export function RoiPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const cur = project.settings.estimate.currency;
  const [i, setI] = useStored(project.id, "roi", ROI_DEFAULT);
  const takeoff = useMemo(() => buildTakeoff(project), [project]);
  const r = useMemo(() => computeRoi(i), [i]);
  const m = (n: number) => `${cur}${Math.round(n).toLocaleString("en-US")}`;
  const pct = (n: number | null) => (n == null ? "n/a" : `${n.toFixed(1)}%`);
  return (
    <div className="space-y-4">
      <Card title="Property ROI calculator">
        <Prelim>Every figure comes from the numbers you type. No market data, rents or growth rates are assumed. Results are projections, not guarantees or financial advice.</Prelim>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROI_FIELDS.map(([k, label]) => <NumberField key={k} label={label} allowEmpty={false} value={i[k]} onCommit={(v) => { if (v != null) setI({ ...i, [k]: k === "years" || k === "loanYears" ? Math.round(v) : v }); }} />)}
        </div>
        {takeoff.grandTotal > 0 && <button className={btn} onClick={() => setI({ ...i, construction: Math.round(takeoff.grandTotal) })}>Use my material estimate ({m(takeoff.grandTotal)}) as construction cost</button>}
      </Card>
      {r.totalInvestment > 0 && (
        <Card title="Results">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total investment" value={m(r.totalInvestment)} /><Stat label="Your own money (equity)" value={m(r.equity)} /><Stat label="Monthly loan instalment" value={m(r.emi)} />
            <Stat label="Gross rental yield" value={pct(r.grossYieldPct)} /><Stat label="Net rental yield (year 1)" value={pct(r.netYieldPct)} /><Stat label="Rent pays back total in" value={r.paybackYears == null ? "not within period" : `${r.paybackYears.toFixed(1)} years`} />
            <Stat label={`Sale value after ${i.years} years`} value={m(r.saleValue)} /><Stat label="Cash left after sale and loan" value={m(r.netSaleProceeds)} />
            <Stat label="Total profit on your equity" value={m(r.profit)} tone={r.profit >= 0 ? "good" : "bad"} /><Stat label="Return on equity (total)" value={pct(r.roiPct)} /><Stat label="IRR (with loan)" value={pct(r.irrLeveragedPct)} /><Stat label="IRR (no loan)" value={pct(r.irrUnleveragedPct)} />
            <Stat label={`NPV at ${i.discountPct}%`} value={m(r.npv)} tone={r.npv >= 0 ? "good" : "bad"} />
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Year</th><th>Rent</th><th>Upkeep + tax</th><th>Loan payments</th><th>Net cash</th></tr></thead><tbody>
            {r.cashFlows.map((c) => <tr key={c.year} className="border-t border-ink-100"><td className="py-1">{c.year}</td><td>{m(c.rent)}</td><td>{m(c.costs)}</td><td>{m(c.emi)}</td><td className={c.net < 0 ? "text-red-700" : ""}>{m(c.net)}</td></tr>)}
          </tbody></table></div>
        </Card>
      )}
    </div>
  );
}

const RULE_FIELDS: Array<[keyof Rules, string]> = [
  ["front", "Front setback min (m)"], ["rear", "Rear setback min (m)"], ["side", "Side setbacks min (m)"], ["far", "Max FAR"], ["coveragePct", "Max ground coverage %"], ["maxHeight", "Max height (m)"],
  ["minHabitableArea", "Min bedroom/living area (m²)"], ["minHabitableWidth", "Min bedroom/living width (m)"], ["minKitchenArea", "Min kitchen area (m²)"], ["minBathArea", "Min bathroom area (m²)"], ["minToiletArea", "Min toilet area (m²)"], ["minCeilingHeight", "Min ceiling height (m)"], ["minWindowPct", "Min window area % of floor"],
];
export function CompliancePage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [rules, setRules] = useStored<Rules>(project.id, "rules", EMPTY_RULES);
  const checks = useMemo(() => checkCompliance(project, rules), [project, rules]);
  const sum = complianceSummary(checks);
  const shown = checks.filter((c) => c.status !== "not set");
  return (
    <div className="space-y-4">
      <Card title="Building regulation self-check" right={<div className="flex gap-2"><button className={btn} onClick={() => setRules(EXAMPLE_RULES)}>Fill example values</button><button className={btn} onClick={() => setRules(EMPTY_RULES)}>Clear</button></div>}>
        <Prelim>Building rules differ by country, city and plot type. Type the limits from YOUR local bylaws; the app only compares your plan with them. The example values are commonly cited minimums, not your local law. This is a self-check, <strong>not a building approval</strong>: your architect and the local authority decide compliance.</Prelim>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label htmlFor="rd" className="mb-1 block text-xs font-medium text-ink-600">Road is on the</label><select id="rd" className="w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-sm" value={rules.roadSide} onChange={(e) => setRules({ ...rules, roadSide: e.target.value as Rules["roadSide"] })}>{(["bottom", "top", "left", "right"] as const).map((s) => <option key={s} value={s}>{s} of the plan</option>)}</select></div>
          {RULE_FIELDS.map(([k, label]) => <NumberField key={k} label={label} value={rules[k] as number | null} onCommit={(v) => setRules({ ...rules, [k]: v })} />)}
        </div>
        <p className="mb-2 text-xs text-ink-600">FAR, coverage and height also use the limits you set in the plan's Plot settings when left empty here.</p>
        <div className="mb-3 grid gap-3 sm:grid-cols-3"><Stat label="Pass" value={String(sum.pass)} tone="good" /><Stat label="Fail" value={String(sum.fail)} tone={sum.fail ? "bad" : undefined} /><Stat label="Not checked (no limit set)" value={String(sum.notSet)} /></div>
        {shown.length === 0 ? <p className="text-sm text-ink-600">Enter at least one limit above to see results.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Check</th><th>Required</th><th>Your plan</th><th>Result</th></tr></thead><tbody>
            {shown.map((c) => <tr key={c.id} className="border-t border-ink-100"><td className="py-1">{c.label}</td><td>{c.required}</td><td>{c.actual}</td><td><Pill tone={c.status === "pass" ? "good" : "bad"}>{c.status === "pass" ? "Pass" : "Fail"}</Pill></td></tr>)}
          </tbody></table></div>
        )}
        <p className="mt-3 text-[11px] text-ink-500">Limits are stored in this browser only, not in the project file.</p>
      </Card>
    </div>
  );
}

interface Cand { key: string; label: string; project: Project }
const ROWS: Array<[keyof Metrics, string, (v: number) => string]> = [
  ["builtUp", "Built-up room area (m²)", (v) => v.toFixed(1)], ["floors", "Floors", (v) => String(v)], ["rooms", "Rooms", (v) => String(v)], ["bedrooms", "Bedrooms", (v) => String(v)], ["bathrooms", "Bathrooms", (v) => String(v)],
  ["coveragePct", "Ground coverage %", (v) => v.toFixed(1)], ["far", "FAR", (v) => v.toFixed(2)], ["windowPct", "Window area % of floor", (v) => v.toFixed(1)],
  ["circulationPct", "Circulation share %", (v) => v.toFixed(1)], ["habitablePct", "Habitable share %", (v) => v.toFixed(1)], ["wetPct", "Wet-area share %", (v) => v.toFixed(1)],
  ["reviewAttention", "Review: needs attention", (v) => String(v)], ["reviewAdvice", "Review: advice", (v) => String(v)], ["vastuFavoured", "Vastu: favoured placements", (v) => String(v)],
  ["cost", "Estimated cost (needs your rates)", (v) => Math.round(v).toLocaleString("en-US")], ["costPerSqm", "Cost per m²", (v) => Math.round(v).toLocaleString("en-US")],
];
export function ComparePage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [cands, setCands] = useState<Cand[]>([]);
  const [sel, setSel] = useState<string[]>(["current"]);
  useEffect(() => {
    const out: Cand[] = [{ key: "current", label: "Current design", project }];
    for (const s of loadSnapshots(project.id).slice().reverse()) {
      const r = snapshotProject(s);
      if (r.ok) out.push({ key: `v:${s.id}`, label: `Version: ${s.label}`, project: r.project });
    }
    try { for (const q of listProjects()) if (q.id !== project.id) out.push({ key: `p:${q.id}`, label: `Project: ${q.name}`, project: q }); } catch { /* ignore */ }
    setCands(out);
  }, [project]);
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? (s.length > 1 ? s.filter((x) => x !== k) : s) : s.length >= 3 ? s : [...s, k]));
  const chosen = sel.map((k) => cands.find((c) => c.key === k)).filter((c): c is Cand => !!c);
  const metrics = useMemo(() => chosen.map((c) => designMetrics(c.project)), [chosen]);
  const thumbs = useMemo(() => chosen.map((c) => { try { return planToSvg(c.project, c.project.floors[0].id, { showTitleBlock: false }); } catch { return ""; } }), [chosen]);
  return (
    <div className="space-y-4">
      <Card title="Compare designs (up to 3)">
        <p className="mb-3 text-xs text-ink-600">Pick your current design, saved versions (Studio → History) or other projects saved in this browser.</p>
        <div className="mb-3 flex flex-wrap gap-1.5">{cands.map((c) => <Chip key={c.key} active={sel.includes(c.key)} onClick={() => toggle(c.key)}>{c.label}</Chip>)}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Measure</th>{chosen.map((c) => <th key={c.key} className="pr-2">{c.label}</th>)}</tr></thead>
            <tbody>
              <tr><td className="py-1 text-xs text-ink-500">Ground-floor plan</td>{thumbs.map((t, i) => <td key={i} className="pr-2"><div className="h-28 w-40 overflow-hidden rounded border border-ink-200 bg-white [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: t }} /></td>)}</tr>
              {ROWS.map(([k, label, fmt]) => (
                <tr key={k} className="border-t border-ink-100"><td className="py-1">{label}</td>{metrics.map((m, i) => { const v = m[k] as number | null; const d = i > 0 && v != null && metrics[0][k] != null ? v - (metrics[0][k] as number) : null; return <td key={i} className="pr-2">{v == null ? "-" : fmt(v)}{d != null && Math.abs(d) > 1e-6 && <span className="ml-1 text-[11px] text-ink-500">({d > 0 ? "+" : ""}{fmt(d)})</span>}</td>; })}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">Differences in brackets are against the first design. Lower review counts are better; cost appears only when you have entered rates in the Materials page.</p>
      </Card>
      <Card title="Space optimisation hints">
        {chosen.map((c, i) => <div key={c.key} className="mb-2"><strong className="text-sm">{c.label}</strong><ul className="list-disc pl-5 text-sm text-ink-700">{spaceHints(metrics[i]).map((h, j) => <li key={j}>{h}</li>)}</ul></div>)}
        <Prelim>Hints use simple area ratios. They do not redesign the plan.</Prelim>
      </Card>
    </div>
  );
}
