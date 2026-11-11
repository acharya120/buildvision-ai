"use client";

import { useMemo } from "react";
import { buildTakeoff, takeoffCsv } from "@/lib/materials/takeoff";
import { DEFAULT_MATERIALS, materialsOf, setMaterials } from "@/lib/materials/config";
import type { MaterialsConfig } from "@/lib/model/types";
import { setRate } from "@/lib/model/ops";
import { downloadText, safeFileName } from "@/lib/export/download";
import { useWorkspace } from "@/lib/state/store";
import { btn, NumberField } from "../ui/Field";
import { Card } from "./shared";

const FIELDS: Array<[keyof MaterialsConfig, string, string]> = [
  ["masonryWastePct", "Brick wastage %", ""], ["tileWastePct", "Tile wastage %", ""], ["mortarSharePct", "Mortar share of masonry %", ""],
  ["plasterThickness", "Plaster thickness (m)", ""], ["slabThickness", "Slab thickness (m)", ""], ["frameConcretePerM2", "Frame concrete (m³ per m² built-up)", ""],
  ["steelKgPerM3", "Steel (kg per m³ concrete)", ""], ["paintCoats", "Paint coats", ""], ["paintCoverage", "Paint coverage (m²/litre/coat)", ""],
  ["wetTileHeight", "Bathroom wall tile height (m)", ""], ["kitchenTileHeight", "Kitchen splash height (m)", ""],
  ["labourPct", "Labour % on materials", ""], ["contingencyPct", "Contingency %", ""], ["taxPct", "Tax %", ""],
];

export default function MaterialsTab() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const t = useMemo(() => buildTakeoff(project), [project]);
  const cfg = materialsOf(project);
  const cur = project.settings.estimate.currency;
  const money = (n: number) => `${cur}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const groups = [...new Set(t.lines.map((l) => l.group))];
  return (
    <div className="space-y-4">
      <Card title="Material estimate and cost" right={<button className={btn} onClick={() => downloadText(takeoffCsv(project), `${safeFileName(project.name)}-materials.csv`, "text/csv")}>Download CSV</button>}>
        <p className="mb-3 text-xs text-ink-600">Quantities come from your plan and the editable factors below. <strong>No prices are pre-filled</strong>: enter the rates you pay locally and the cost is quantity × rate. This is a planning estimate, not a bill of quantities.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {[["Materials", money(t.materialTotal)], ["Labour + contingency + tax", money(t.labour + t.contingency + t.tax)], ["Grand total", money(t.grandTotal)], ["Per m² / sq ft", t.perSqm != null && t.perSqft != null ? `${money(t.perSqm)} / ${money(t.perSqft)}` : "enter rates"]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-ink-200 p-3"><p className="text-xs text-ink-500">{k}</p><p className="text-base font-bold">{v}</p></div>
          ))}
        </div>
        {t.unrated.length > 0 && <p className="mt-2 text-xs text-amber-800">{t.unrated.length} item(s) have no rate yet, so totals are incomplete.</p>}
        {project.targetBudget != null && t.grandTotal > 0 && <p className="mt-1 text-xs text-ink-700">Target budget {money(project.targetBudget)}: {t.grandTotal <= project.targetBudget ? `${money(project.targetBudget - t.grandTotal)} left` : `${money(t.grandTotal - project.targetBudget)} over`}.</p>}
      </Card>

      {groups.map((g) => (
        <Card key={g} title={g}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-ink-500"><th className="py-1 pr-2">Item</th><th className="pr-2">Quantity</th><th className="pr-2">Rate ({cur} per unit)</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {t.lines.filter((l) => l.group === g).map((l) => (
                  <tr key={l.key} className="border-t border-ink-100 align-top">
                    <td className="py-1.5 pr-2"><div>{l.name}</div><div className="text-[11px] text-ink-500">{l.note}</div></td>
                    <td className="whitespace-nowrap pr-2">{l.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} {l.unit}<div className={`text-[10px] ${l.basis === "assumption" ? "text-amber-800" : "text-ink-500"}`}>{l.basis}</div></td>
                    <td className="w-36 pr-2"><NumberField label={`Rate for ${l.name}`} value={project.rates[l.key] ?? null} onCommit={(v) => ws.commit(setRate(ws.getState().project, l.key, v))} /></td>
                    <td className="whitespace-nowrap text-right">{l.amount != null ? money(l.amount) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <Card title="Assumptions you can change" right={<button className={btn} onClick={() => ws.commit(setMaterials(project, DEFAULT_MATERIALS))}>Reset to defaults</button>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map(([k, label]) => <NumberField key={k} label={label} allowEmpty={false} value={cfg[k]} onCommit={(v) => { if (v != null) ws.commit(setMaterials(ws.getState().project, { [k]: v })); }} />)}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-600">{t.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </Card>
    </div>
  );
}
