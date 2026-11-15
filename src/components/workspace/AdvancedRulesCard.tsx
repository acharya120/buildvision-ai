"use client";

import { useState } from "react";
import type { AutoDesignInput, DesignOption } from "@/lib/layout/autodesign";
import type { Plot } from "@/lib/model/types";
import { DEFAULT_ENGINE_INPUT, generateEngineWithFit, type EngineResult } from "@/lib/layout/engine/solver";
import { CORRIDOR_LIMITS, GRID_PRESETS, type GridSpec } from "@/lib/layout/engine/types";
import { btnPrimary, inputCls, Label } from "../ui/Field";

type Result = { options: DesignOption[]; errors: string[]; adjustments?: string[] };

/**
 * OPTIONAL "Advanced rules" generator: structural grid, coverage and FAR limits, wet-wall stacking, corridor and shape rules.
 * Off by default. The classic generator above is untouched; this adds a second way to produce the same kind of options.
 */
export default function AdvancedRulesCard({ base, plot, onResult }: { base: AutoDesignInput; plot: Plot; onResult: (r: Result) => void }) {
  const [on, setOn] = useState(false);
  const [preset, setPreset] = useState(GRID_PRESETS[0].id);
  const [custom, setCustom] = useState<GridSpec>({ spanX: 3.0, spanY: 3.0 });
  const [corr, setCorr] = useState<number>(CORRIDOR_LIMITS.usualMax);
  const [cov, setCov] = useState("");
  const [far, setFar] = useState("");
  const parse = (s: string): number | null => (s.trim() === "" ? null : Number(s));
  const grid: GridSpec = preset === "custom" ? custom : (GRID_PRESETS.find((p) => p.id === preset) ?? GRID_PRESETS[0]).grid;

  const run = () => {
    const res: EngineResult = generateEngineWithFit(plot, {
      ...DEFAULT_ENGINE_INPUT,
      floors: base.floors, bedrooms: base.bedrooms, includeDining: base.includeDining, includeStudy: base.includeStudy, includeGarage: base.includeGarage,
      includeBalcony: base.includeBalcony, includeUtility: base.includeUtility, attachedBathMaster: base.attachedBathMaster, northAngle: base.northAngle, frontSide: base.frontSide,
      grid, corridorWidth: corr,
      zoning: { setbackFront: base.setbackFront, setbackRear: base.setbackRear, setbackSide: base.setbackSide, maxCoveragePct: parse(cov), maxFar: parse(far) },
    });
    onResult({ options: res.options, errors: res.errors, adjustments: res.adjustments });
  };
  const numIn = (v: number) => (Number.isNaN(v) ? "" : String(v));

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="adv-h">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="adv-h" className="text-base font-semibold">Advanced rules (optional)</h2>
        <label className="flex items-center gap-2 text-sm" htmlFor="adv-on">
          <input id="adv-on" type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Use structural grid, coverage and FAR limits, wet-wall stacking and corridor rules
        </label>
      </div>
      {on && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink-600">
            Builds up to three layouts whose walls fall on a structural grid, with stairs and bathrooms stacked on every floor, corridors of at least {CORRIDOR_LIMITS.min} m, and nothing outside your setbacks, coverage or FAR limits.
            It uses the floors, bedrooms, rooms and setbacks entered above. <strong>All limits are the numbers you type; nothing is assumed, and the result is a preliminary concept, not a code approval or structural design.</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="adv-grid">Structural grid</Label>
              <select id="adv-grid" className={inputCls} value={preset} onChange={(e) => setPreset(e.target.value)}>
                {GRID_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">Custom spans…</option>
              </select>
            </div>
            {preset === "custom" && (
              <>
                <div><Label htmlFor="adv-gx">Span along x (m)</Label><input id="adv-gx" className={inputCls} inputMode="decimal" value={numIn(custom.spanX)} onChange={(e) => setCustom((c) => ({ ...c, spanX: e.target.value.trim() === "" ? NaN : Number(e.target.value) }))} /></div>
                <div><Label htmlFor="adv-gy">Span along y (m)</Label><input id="adv-gy" className={inputCls} inputMode="decimal" value={numIn(custom.spanY)} onChange={(e) => setCustom((c) => ({ ...c, spanY: e.target.value.trim() === "" ? NaN : Number(e.target.value) }))} /></div>
              </>
            )}
            <div><Label htmlFor="adv-corr">Corridor width (m, {CORRIDOR_LIMITS.min}–{CORRIDOR_LIMITS.usualMax} usual)</Label><input id="adv-corr" className={inputCls} inputMode="decimal" value={numIn(corr)} onChange={(e) => setCorr(e.target.value.trim() === "" ? NaN : Number(e.target.value))} /></div>
            <div><Label htmlFor="adv-cov">Max ground coverage % (blank = none)</Label><input id="adv-cov" className={inputCls} inputMode="decimal" value={cov} onChange={(e) => setCov(e.target.value)} /></div>
            <div><Label htmlFor="adv-far">Max FAR / FSI (blank = none)</Label><input id="adv-far" className={inputCls} inputMode="decimal" value={far} onChange={(e) => setFar(e.target.value)} /></div>
          </div>
          <button className={btnPrimary} onClick={run}>Generate with rules</button>
        </div>
      )}
    </section>
  );
}
