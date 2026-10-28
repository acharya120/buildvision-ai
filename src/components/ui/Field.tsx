"use client";

import { useEffect, useId, useState } from "react";
import type { UnitSystem } from "@/lib/model/types";
import { lengthToInput, parseLength, unitLabel } from "@/lib/model/units";

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1";
export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500";
export const inputCls =
  "w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-600">
      {children}
    </label>
  );
}

export function TextField({
  label,
  value,
  onCommit,
  maxLength = 60,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  maxLength?: number;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        className={inputCls}
        value={text}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onCommit(text)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

/** Length input: shows the value in the project's unit, accepts "12", "12'6\"", "3.5m", "350cm". */
export function LengthField({
  label,
  meters,
  system,
  onCommit,
  min = 0.01,
  max = 1000,
}: {
  label: string;
  meters: number;
  system: UnitSystem;
  onCommit: (m: number) => void;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const [text, setText] = useState(lengthToInput(meters, system));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(lengthToInput(meters, system));
    setError(null);
  }, [meters, system]);

  const commit = () => {
    const parsed = parseLength(text, system);
    if (parsed == null) {
      setError("Enter a positive number, e.g. 12 or 12'6\"");
      return;
    }
    if (parsed < min || parsed > max) {
      setError(`Allowed range: ${min} to ${max} m`);
      return;
    }
    setError(null);
    if (Math.abs(parsed - meters) > 1e-6) onCommit(parsed);
    else setText(lengthToInput(meters, system));
  };
  return (
    <div>
      <Label htmlFor={id}>
        {label} ({unitLabel(system)})
      </Label>
      <input
        id={id}
        className={`${inputCls} ${error ? "border-red-400" : ""}`}
        inputMode="decimal"
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Plain number input (rates, budgets, percentages). Empty text means "no value". */
export function NumberField({
  label,
  value,
  onCommit,
  allowEmpty = true,
  min = 0,
  step = "any",
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  allowEmpty?: boolean;
  min?: number;
  step?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value == null ? "" : String(value));
  const [error, setError] = useState(false);
  useEffect(() => {
    setText(value == null ? "" : String(value));
    setError(false);
  }, [value]);
  const commit = () => {
    if (text.trim() === "") {
      if (allowEmpty) {
        setError(false);
        if (value != null) onCommit(null);
      } else setError(true);
      return;
    }
    const n = Number(text);
    if (!Number.isFinite(n) || n < min) return setError(true);
    setError(false);
    if (n !== value) onCommit(n);
  };
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        className={`${inputCls} ${error ? "border-red-400" : ""}`}
        inputMode="decimal"
        step={step}
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">Enter a valid number{min === 0 ? " (0 or more)" : ""}.</p>}
    </div>
  );
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <details className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" open={!compact}>
      <summary className="cursor-pointer font-semibold">Safety disclaimer</summary>
      <p className="mt-1 leading-relaxed">
        BuildVision AI provides conceptual design, visualization, and preliminary estimation tools. Outputs are not automatically approved architectural drawings, structural engineering designs, or construction instructions. A qualified architect and structural engineer must review and approve all relevant plans before construction. Soil conditions, foundations, reinforcement, beams, columns, slabs, staircase safety, fire safety, accessibility, setbacks, local building regulations, and other site-specific requirements must be professionally assessed.
      </p>
    </details>
  );
}
