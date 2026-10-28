"use client";

import { useMemo } from "react";
import { buildEstimate } from "@/lib/estimate/estimate";
import { setEstimateAssumptions, setRate } from "@/lib/model/ops";
import { formatArea } from "@/lib/model/units";
import { estimateCsv } from "@/lib/export/csv";
import { downloadText, safeFileName } from "@/lib/export/download";
import { useWorkspace } from "@/lib/state/store";
import { btn, Disclaimer, NumberField, TextField } from "../ui/Field";

const BASIS_LABEL = { measured: "Measured", calculated: "Calculated", assumption: "Assumption" } as const;
const BASIS_STYLE = {
  measured: "bg-green-100 text-green-800",
  calculated: "bg-blue-100 text-blue-800",
  assumption: "bg-amber-100 text-amber-900",
} as const;

export default function EstimatePanel() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const est = useMemo(() => buildEstimate(project), [project]);
  const cur = project.settings.estimate.currency;
  const sys = project.unitSystem;
  const money = (n: number) => `${cur}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Preliminary quantity estimate</h2>
          <p className="text-sm text-ink-600">
            Quantities are calculated from your plan. <strong>Cost = quantity × the rate you enter.</strong> No prices are pre-filled, because current local rates cannot be verified here.
          </p>
        </div>
        <button className={btn} onClick={() => downloadText(estimateCsv(project), `${safeFileName(project.name)}-estimate.csv`, "text/csv")}>Download CSV</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ink-200 bg-white p-3">
          <p className="text-xs text-ink-500">Total of rated items</p>
          <p className="text-xl font-bold">{money(est.totalCost)}</p>
          {est.unrated.length > 0 && <p className="mt-1 text-xs text-amber-800">{est.unrated.length} item(s) still have no rate, so the total is incomplete.</p>}
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-3">
          <p className="text-xs text-ink-500">Target budget</p>
          <p className="text-xl font-bold">{project.targetBudget != null ? money(project.targetBudget) : "not set"}</p>
          {est.budgetRemaining != null && (
            <p className={`mt-1 text-xs ${est.budgetRemaining < 0 ? "text-red-700" : "text-green-700"}`}>
              {est.budgetRemaining < 0 ? `Over by ${money(-est.budgetRemaining)}` : `${money(est.budgetRemaining)} remaining`} (rated items only)
            </p>
          )}
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-3">
          <p className="text-xs text-ink-500">Total room area (all floors)</p>
          <p className="text-xl font-bold">{formatArea(est.floors.reduce((s, f) => s + f.roomArea, 0), sys)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-ink-50 text-left text-xs text-ink-600">
            <tr>
              <th className="p-2">Item</th>
              <th className="p-2 text-right">Quantity</th>
              <th className="p-2">Unit</th>
              <th className="w-36 p-2">Your rate ({cur} per unit)</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {est.lines.map((l) => (
              <tr key={l.key} className="border-t border-ink-100 align-top">
                <td className="p-2">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-ink-500">{l.note}</div>
                </td>
                <td className="p-2 text-right tabular-nums">{l.quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>
                <td className="p-2">{l.unit}</td>
                <td className="p-2">
                  {l.costable ? (
                    <NumberField label={`Rate for ${l.name}`} value={l.rate} onCommit={(v) => ws.commit(setRate(ws.getState().project, l.key, v))} />
                  ) : (
                    <span className="text-xs text-ink-400">not costed</span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">{l.amount != null ? money(l.amount) : "-"}</td>
                <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-xs ${BASIS_STYLE[l.basis]}`}>{BASIS_LABEL[l.basis]}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-300 font-semibold">
              <td className="p-2" colSpan={4}>Total of rated items</td>
              <td className="p-2 text-right tabular-nums">{money(est.totalCost)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-ink-500">Rates are per m², m³ or piece (the unit shown), whichever unit system the project uses. Labels: <strong>Measured</strong> = counted/measured from the model; <strong>Calculated</strong> = geometry arithmetic; <strong>Assumption</strong> = depends on an assumption you can change below.</p>

      <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="assump-h">
        <h3 id="assump-h" className="mb-3 font-semibold">Assumptions you control</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField label="Currency symbol" value={cur} maxLength={6} onCommit={(v) => ws.commit(setEstimateAssumptions(ws.getState().project, { currency: v }))} />
          <NumberField label="Extra paint deduction (%)" value={project.settings.estimate.paintExtraDeductionPct} allowEmpty={false} onCommit={(v) => ws.commit(setEstimateAssumptions(ws.getState().project, { paintExtraDeductionPct: Math.min(100, v ?? 0) }))} />
          <NumberField label="Assumed slab thickness (m)" value={project.settings.estimate.slabThickness} allowEmpty={false} onCommit={(v) => ws.commit(setEstimateAssumptions(ws.getState().project, { slabThickness: v ?? 0 }))} />
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={project.settings.estimate.includeSlabConcrete} onChange={(e) => ws.commit(setEstimateAssumptions(ws.getState().project, { includeSlabConcrete: e.target.checked }))} />
            Include slab concrete line
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="floors-sum">
        <h3 id="floors-sum" className="mb-2 font-semibold">By floor</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500"><tr><th className="p-1">Floor</th><th className="p-1 text-right">Rooms</th><th className="p-1 text-right">Room area</th><th className="p-1 text-right">Wall length</th><th className="p-1 text-right">Doors</th><th className="p-1 text-right">Windows</th></tr></thead>
          <tbody>
            {est.floors.map((f) => (
              <tr key={f.floorId} className="border-t border-ink-100">
                <td className="p-1">{f.name}</td>
                <td className="p-1 text-right">{f.roomCount}</td>
                <td className="p-1 text-right">{formatArea(f.roomArea, sys)}</td>
                <td className="p-1 text-right">{f.wallLength.toFixed(1)} m</td>
                <td className="p-1 text-right">{f.doorCount}</td>
                <td className="p-1 text-right">{f.windowCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" aria-labelledby="na-h">
        <h3 id="na-h" className="mb-1 font-semibold">Not estimated here</h3>
        <ul className="list-disc space-y-0.5 pl-5">
          {est.unavailable.map((u, i) => <li key={i}>{u}</li>)}
        </ul>
      </section>
      <Disclaimer compact />
    </div>
  );
}
