"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { liveSummary } from "@/lib/analysis/live";
import { ROOM_TYPE_LABELS } from "@/lib/model/defaults";
import { formatArea } from "@/lib/model/units";

/** Live area and quantity strip under the plan. Updates on every edit. Preliminary figures, not certified. */
export default function LiveSummaryBar() {
  const { project } = useWorkspace().state;
  const [open, setOpen] = useState(false);
  const s = useMemo(() => liveSummary(project), [project]);
  const sys = project.unitSystem;
  const stat = (label: string, value: string) => (
    <div className="min-w-[5.5rem]"><div className="text-[10px] uppercase tracking-wide text-ink-500">{label}</div><div className="text-sm font-semibold" data-testid={`live-${label}`}>{value}</div></div>
  );
  return (
    <section className="border-t border-ink-200 bg-white px-3 py-2 text-ink-900" aria-label="Live area and quantities">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
        {stat("Rooms", formatArea(s.roomArea, sys))}
        {stat("Built-up", formatArea(s.builtUp, sys))}
        {stat("Coverage", `${s.coveragePct.toFixed(1)}%`)}
        {stat("FAR", s.far.toFixed(2))}
        {stat("Circulation", `${s.circulationPct.toFixed(0)}%`)}
        <button className="ml-auto rounded border border-ink-200 px-2 py-1 text-xs font-medium hover:bg-ink-50" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide quantities" : "Areas and quantities"}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="pb-1 text-left font-semibold">Area by room type</caption>
              <tbody>
                {s.byType.map((t) => <tr key={t.type} className="border-t border-ink-100"><td className="py-0.5">{ROOM_TYPE_LABELS[t.type]} ({t.count})</td><td className="py-0.5 text-right">{formatArea(t.area, sys)}</td></tr>)}
                {s.byType.length === 0 && <tr><td className="py-1 text-ink-500">No rooms yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="pb-1 text-left font-semibold">Quantities (from the model)</caption>
              <tbody>
                {s.boq.map((l) => (
                  <tr key={l.key} className="border-t border-ink-100">
                    <td className="py-0.5">{l.name}</td>
                    <td className="py-0.5 text-right">{l.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} {l.unit}</td>
                    <td className="py-0.5 text-right">{l.amount != null ? l.amount.toLocaleString() : "no rate"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-ink-600">
              {s.totalCost != null ? `Total of lines with your rates: ${s.totalCost.toLocaleString()}${s.unratedCount ? ` (${s.unratedCount} line(s) still have no rate)` : ""}. ` : "No prices are assumed; enter your own rates in the Estimate tab. "}
              Preliminary quantities from the model, not a certified area statement or bill of quantities. Setbacks and FAR rules differ by city.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
