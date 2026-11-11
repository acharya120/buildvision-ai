"use client";

import type { ReactNode } from "react";
import { inputCls } from "../ui/Field";

export function Lbl({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="text-xs text-ink-600">{label}</span>{children}</label>;
}
export function Txt({ label, value, onChange, type = "text", max = 120 }: { label: string; value: string; onChange: (v: string) => void; type?: string; max?: number }) {
  return <Lbl label={label}><input className={inputCls} type={type} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} /></Lbl>;
}
/** Number box that keeps what you type and only commits finite numbers. */
export function Num({ label, value, onChange, allowEmpty = false, min = 0, step = "any" }: { label: string; value: number | null; onChange: (v: number | null) => void; allowEmpty?: boolean; min?: number; step?: string }) {
  return (
    <Lbl label={label}>
      <input className={inputCls} type="number" inputMode="decimal" min={min} step={step} defaultValue={value ?? ""} key={String(value)}
        onBlur={(e) => { const t = e.target.value.trim(); if (t === "") { if (allowEmpty) onChange(null); return; } const n = Number(t); if (isFinite(n) && n >= min) onChange(n); }} />
    </Lbl>
  );
}
export function Sel<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return <Lbl label={label}><select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Lbl>;
}
export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
