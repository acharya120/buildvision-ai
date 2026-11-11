"use client";

import type { ReactNode } from "react";
import { PRELIM } from "@/lib/engineering/prelim";
import type { Check } from "@/lib/analysis/compliance";
import { NumberField } from "../ui/Field";
import { Pill } from "../analysis/common";

export function PrelimBanner({ children }: { children?: ReactNode }) {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Preliminary, not certified. </strong>{children} {PRELIM}</p>;
}

export function NumGrid<T extends object>({ fields, value, onChange, nullable = true }: { fields: Array<[keyof T, string]>; value: T; onChange: (v: T) => void; nullable?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map(([k, label]) => (
        <NumberField key={String(k)} label={label} allowEmpty={nullable} value={value[k] as unknown as number | null} onCommit={(v) => { if (v != null || nullable) onChange({ ...value, [k]: v }); }} />
      ))}
    </div>
  );
}

export function CheckTable({ checks, empty }: { checks: Check[]; empty: string }) {
  const shown = checks.filter((c) => c.status !== "not set");
  if (!shown.length) return <p className="text-sm text-ink-600">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Check</th><th>Required</th><th>Your plan</th><th>Result</th></tr></thead>
        <tbody>{shown.map((c) => <tr key={c.id} className="border-t border-ink-100"><td className="py-1">{c.label}</td><td>{c.required}</td><td>{c.actual}</td><td><Pill tone={c.status === "pass" ? "good" : "bad"}>{c.status === "pass" ? "Pass" : "Fail"}</Pill></td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function Bars({ title, data, unit = "", max = 8 }: { title: string; data: Array<{ label: string; value: number }>; unit?: string; max?: number }) {
  const rows = data.filter((d) => d.value > 0).slice(0, max);
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-ink-700">{title}</h4>
      {rows.length === 0 ? <p className="text-xs text-ink-500">No data yet.</p> : (
        <ul className="space-y-1" role="list">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate" title={r.label}>{r.label}</span>
              <span className="h-3 rounded bg-ink-100"><span className="block h-3 rounded bg-brand-600" style={{ width: `${(r.value / top) * 100}%` }} /></span>
              <span className="tabular-nums text-ink-600">{Math.round(r.value).toLocaleString("en-US")}{unit}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
