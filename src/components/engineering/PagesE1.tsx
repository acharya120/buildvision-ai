"use client";

import { useMemo, useState } from "react";
import { EMPTY_FIRE, EXAMPLE_FIRE, fireAnalysis, type FireRules } from "@/lib/engineering/fire";
import { EXAMPLE_ACCESS, EMPTY_ACCESS, checkAccessibility, type AccessRules } from "@/lib/engineering/accessibility";
import { detectClashes } from "@/lib/engineering/clash";
import { DEFAULT_ENERGY, computeEnergy } from "@/lib/engineering/energy";
import { DEFAULT_CARBON, DEFAULT_CARBON_FACTORS, computeCarbon } from "@/lib/engineering/carbon";
import { fireSvg, clashSvg } from "@/lib/engineering/sheets";
import { complianceSummary } from "@/lib/analysis/compliance";
import { csvHeader } from "@/lib/engineering/prelim";
import { downloadText, safeFileName } from "@/lib/export/download";
import { useStored } from "@/lib/analysis/useStored";
import { SECTOR_NAMES } from "@/lib/analysis/compass";
import { useWorkspace } from "@/lib/state/store";
import { btn, NumberField } from "../ui/Field";
import { Card, Chip, SvgDownloads, SvgView } from "../studio/shared";
import { Pill, Stat } from "../analysis/common";
import { Bars, CheckTable, NumGrid, PrelimBanner } from "./common";

const FIRE_FIELDS: Array<[keyof FireRules, string]> = [["maxTravel", "Max travel distance to an exit (m)"], ["minExits", "Min exits per floor"], ["exitsAboveArea", "…when floor area is at least (m²)"], ["minStairWidth", "Min staircase width (m)"], ["minCorridor", "Min corridor width (m)"], ["areaPerExtinguisher", "Floor area per extinguisher (m²)"]];
export function FirePage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [rules, setRules] = useStored<FireRules>(project.id, "fire", EMPTY_FIRE);
  const [fi, setFi] = useState(0);
  const idx = Math.min(fi, project.floors.length - 1);
  const res = useMemo(() => fireAnalysis(project, rules), [project, rules]);
  const svg = useMemo(() => fireSvg(project, idx, rules), [project, idx, rules]);
  const sum = complianceSummary(res.checks);
  return (
    <div className="space-y-4">
      <Card title="Fire safety and evacuation planning" right={<div className="flex gap-2"><button className={btn} onClick={() => setRules(EXAMPLE_FIRE)}>Fill example values</button><button className={btn} onClick={() => setRules(EMPTY_FIRE)}>Clear</button></div>}>
        <PrelimBanner>Escape routes are calculated from your doors and rooms. Fire codes depend on country, occupancy and building height, so type YOUR local limits; the example values are only commonly cited figures. Fire load, fire-rated walls and doors, smoke control, alarms and sprinklers are not assessed.</PrelimBanner>
        <div className="my-3"><NumGrid fields={FIRE_FIELDS} value={rules} onChange={setRules} /></div>
        <div className="mb-3 grid gap-3 sm:grid-cols-3"><Stat label="Pass" value={String(sum.pass)} tone="good" /><Stat label="Fail" value={String(sum.fail)} tone={sum.fail ? "bad" : undefined} /><Stat label="Longest route" value={`${Math.max(...res.floors.map((f) => f.maxDistance)).toFixed(1)} m`} /></div>
        <div className="mb-2 flex gap-1.5 overflow-x-auto">{project.floors.map((f, i) => <Chip key={f.id} active={i === idx} onClick={() => setFi(i)}>{f.name}</Chip>)}</div>
        <SvgView svg={svg} label="Evacuation routes" />
        <div className="mt-3"><SvgDownloads svg={svg} base={`fire-${idx + 1}`} /></div>
      </Card>
      <Card title="Checks"><CheckTable checks={res.checks} empty="No route problems found. Enter limits above to check travel distance, exits and widths." /></Card>
    </div>
  );
}

const ACC_FIELDS: Array<[keyof AccessRules, string]> = [["minDoorWidth", "Min door clear width (m)"], ["minEntranceWidth", "Min entrance door width (m)"], ["minCorridor", "Min corridor width (m)"], ["turningCircle", "Wheelchair turning circle (m)"], ["maxRampSlopeRatio", "Steepest ramp 1 in … "], ["minStairWidth", "Min stair width (m)"], ["minLiftW", "Min lift width (m)"], ["minLiftD", "Min lift depth (m)"]];
export function AccessibilityPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [rules, setRules] = useStored<AccessRules>(project.id, "access", EXAMPLE_ACCESS);
  const checks = useMemo(() => checkAccessibility(project, rules), [project, rules]);
  const sum = complianceSummary(checks);
  return (
    <Card title="Universal accessibility planning" right={<div className="flex gap-2"><button className={btn} onClick={() => setRules(EXAMPLE_ACCESS)}>Example values</button><button className={btn} onClick={() => setRules(EMPTY_ACCESS)}>Clear</button></div>}>
      <PrelimBanner>Checks door widths, circulation, a turning space in a ground-floor bathroom, ramp length for your plinth, lift and step-free living against the values below. The defaults are commonly used guideline figures, not your local code; edit them.</PrelimBanner>
      <div className="my-3"><NumGrid fields={ACC_FIELDS} value={rules} onChange={setRules} /></div>
      <div className="mb-3 grid gap-3 sm:grid-cols-3"><Stat label="Pass" value={String(sum.pass)} tone="good" /><Stat label="Fail" value={String(sum.fail)} tone={sum.fail ? "bad" : undefined} /><Stat label="Not checked" value={String(sum.notSet)} /></div>
      <CheckTable checks={checks} empty="Nothing to check yet. Add rooms and doors, or enter limits above." />
    </Card>
  );
}

const SEV = { high: ["High", "bad"], medium: ["Medium", "warn"], info: ["Info", "info"] } as const;
export function ClashPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [fi, setFi] = useState(0);
  const idx = Math.min(fi, project.floors.length - 1);
  const clashes = useMemo(() => detectClashes(project), [project]);
  const svg = useMemo(() => clashSvg(project, idx, clashes), [project, idx, clashes]);
  return (
    <Card title="Clash detection (structure, openings, walls, services)">
      <PrelimBanner>Real geometry checks on your model: overlapping openings, columns or beams against openings, walls with nothing under them, overhangs, and drains crossing living rooms. The structural grid is the app's indicative layout, not an engineered frame, and this is not a certified BIM clash report. The checks are rule-based, not AI.</PrelimBanner>
      <div className="my-3 grid gap-3 sm:grid-cols-3"><Stat label="High" value={String(clashes.filter((c) => c.severity === "high").length)} tone={clashes.some((c) => c.severity === "high") ? "bad" : "good"} /><Stat label="Medium" value={String(clashes.filter((c) => c.severity === "medium").length)} /><Stat label="Info" value={String(clashes.filter((c) => c.severity === "info").length)} /></div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto">{project.floors.map((f, i) => <Chip key={f.id} active={i === idx} onClick={() => setFi(i)}>{f.name}</Chip>)}</div>
      <SvgView svg={svg} label="Clash map" />
      <div className="mt-3 flex flex-wrap gap-2"><SvgDownloads svg={svg} base={`clashes-${idx + 1}`} /><button className={btn} onClick={() => downloadText(csvHeader("Clash report") + "Severity,Between,Floor,Issue\n" + clashes.map((c) => [c.severity, c.between, c.floorName, `"${c.message.replace(/"/g, '""')}"`].join(",")).join("\n"), `${safeFileName(project.name)}-clashes.csv`, "text/csv")}>Clash list (CSV)</button></div>
      <ul className="mt-3 space-y-1.5 text-sm">{clashes.length === 0 && <li className="text-ink-600">No clashes found by these checks.</li>}{clashes.map((c) => <li key={c.id}><Pill tone={SEV[c.severity][1]}>{SEV[c.severity][0]}</Pill> <strong>{c.between}</strong> ({c.floorName}) {c.message}</li>)}</ul>
    </Card>
  );
}

const EN_ENV: Array<["uWall" | "uRoof" | "uWindow" | "shgc", string]> = [["uWall", "Wall U (W/m²K)"], ["uRoof", "Roof U"], ["uWindow", "Window U"], ["shgc", "Window solar gain (SHGC)"]];
export function EnergyPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [inp, setInp] = useStored(project.id, "energy", DEFAULT_ENERGY);
  const r = useMemo(() => computeEnergy(project, inp), [project, inp]);
  const set = (k: keyof typeof inp, v: number | null) => { if (v != null) setInp({ ...inp, [k]: v }); };
  return (
    <div className="space-y-4">
      <Card title="Energy efficiency (envelope and solar)">
        <PrelimBanner>Steady-state envelope heat gain plus solar through glass at the hour of peak sun. People, equipment, ventilation and humidity are not included, so treat the cooling load as a lower bound and use it to compare options, not to size equipment. All inputs below are editable starting values.</PrelimBanner>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Latitude (°)" allowEmpty={false} min={-66} value={inp.lat} onCommit={(v) => { if (v != null && v >= -66 && v <= 66) set("lat", v); }} />
          <NumberField label="Month (1–12)" allowEmpty={false} value={inp.month} onCommit={(v) => { if (v != null && v >= 1 && v <= 12) set("month", Math.round(v)); }} />
          <NumberField label="Day (1–28)" allowEmpty={false} value={inp.day} onCommit={(v) => { if (v != null && v >= 1 && v <= 28) set("day", Math.round(v)); }} />
          <NumberField label="Outdoor peak °C" allowEmpty={false} min={-30} value={inp.tOut} onCommit={(v) => set("tOut", v)} />
          <NumberField label="Indoor target °C" allowEmpty={false} min={-30} value={inp.tIn} onCommit={(v) => set("tIn", v)} />
          <NumberField label="Extra roof heating (K)" allowEmpty={false} value={inp.roofExtraK} onCommit={(v) => set("roofExtraK", v)} />
          <NumberField label="Direct sun W/m²" allowEmpty={false} value={inp.directNormal} onCommit={(v) => set("directNormal", v)} />
          <NumberField label="Shading factor (1 = none)" allowEmpty={false} step="0.05" value={inp.shading} onCommit={(v) => { if (v != null && v >= 0 && v <= 1) set("shading", v); }} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["current", "improved"] as const).map((k) => (
            <div key={k} className="rounded-lg border border-ink-200 p-3">
              <p className="mb-2 text-sm font-semibold">{k === "current" ? "Current construction" : "Improved (insulation, better glass)"}</p>
              <div className="grid grid-cols-2 gap-3">{EN_ENV.map(([f, l]) => <NumberField key={f} label={l} allowEmpty={false} step="0.05" value={inp[k][f]} onCommit={(v) => { if (v != null) setInp({ ...inp, [k]: { ...inp[k], [f]: v } }); }} />)}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Results">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Peak envelope load" value={`${r.peakKw.toFixed(1)} kW`} /><Stat label="About (with 10% margin)" value={`${r.tonnage.toFixed(1)} TR`} /><Stat label="Window-to-wall ratio" value={`${r.wwrPct.toFixed(0)}%`} /><Stat label="Peak solar at" value={`${Math.floor(r.peakHour)}:${r.peakHour % 1 ? "30" : "00"} solar time`} />
          <Stat label="Improved envelope load" value={`${r.improvedPeakKw.toFixed(1)} kW`} tone="good" /><Stat label="Load saved" value={`${r.savingPct.toFixed(0)}%`} tone="good" /><Stat label="Cooling energy, current / improved" value={`${Math.round(r.annualCoolingKwh)} / ${Math.round(r.improvedAnnualKwh)} kWh`} /><Stat label="Roof PV potential" value={`${r.pvKwp.toFixed(1)} kWp, ${Math.round(r.pvAnnualKwh)} kWh/yr`} />
        </div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Facade</th><th>Wall m²</th><th>Window m²</th><th>WWR</th><th>Peak solar gain</th></tr></thead><tbody>{r.facades.map((f) => <tr key={f.sector} className="border-t border-ink-100"><td className="py-1">{SECTOR_NAMES[f.sector]}</td><td>{f.wallArea.toFixed(1)}</td><td>{f.windowArea.toFixed(1)}</td><td>{f.wwrPct.toFixed(0)}%</td><td>{Math.round(f.peakSolarW)} W</td></tr>)}</tbody></table></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <NumberField label="AC efficiency (COP)" allowEmpty={false} step="0.1" value={inp.cop} onCommit={(v) => { if (v != null && v > 0) set("cop", v); }} />
          <NumberField label="Cooling hours / year" allowEmpty={false} value={inp.eflh} onCommit={(v) => set("eflh", v)} />
          <NumberField label="Usable roof for PV %" allowEmpty={false} value={inp.pvUsablePct} onCommit={(v) => { if (v != null && v <= 100) set("pvUsablePct", v); }} />
          <NumberField label="PV yield kWh/kWp/yr" allowEmpty={false} value={inp.kwhPerKwpYear} onCommit={(v) => set("kwhPerKwpYear", v)} />
        </div>
      </Card>
    </div>
  );
}

export function CarbonPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [inp, setInp] = useStored(project.id, "carbon", DEFAULT_CARBON);
  const r = useMemo(() => computeCarbon(project, inp), [project, inp]);
  return (
    <div className="space-y-4">
      <Card title="Sustainability and carbon footprint">
        <PrelimBanner>Embodied carbon = your material quantities × editable factors. The built-in factors are generic orders of magnitude, so replace them with your supplier&apos;s EPD figures for a real assessment. Operational carbon uses only the electricity use and grid factor you type.</PrelimBanner>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Embodied carbon" value={`${(r.embodiedKg / 1000).toFixed(1)} tCO₂e`} /><Stat label="Per m² built-up" value={`${Math.round(r.perSqm)} kgCO₂e`} />
          <Stat label={`Operational (${inp.years} years)`} value={`${(r.operationalKg / 1000).toFixed(1)} tCO₂e`} /><Stat label="What-if saving" value={`${(r.whatIfSavingKg / 1000).toFixed(2)} tCO₂e`} tone="good" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <NumberField label="What-if: cement carbon cut %" allowEmpty={false} value={inp.cementCutPct} onCommit={(v) => { if (v != null && v <= 100) setInp({ ...inp, cementCutPct: v }); }} />
          <NumberField label="What-if: steel carbon cut %" allowEmpty={false} value={inp.steelCutPct} onCommit={(v) => { if (v != null && v <= 100) setInp({ ...inp, steelCutPct: v }); }} />
          <NumberField label="Electricity use kWh/yr" allowEmpty={false} value={inp.annualKwh} onCommit={(v) => { if (v != null) setInp({ ...inp, annualKwh: v }); }} />
          <NumberField label="Grid kgCO₂e per kWh" allowEmpty={false} step="0.01" value={inp.gridKgPerKwh} onCommit={(v) => { if (v != null) setInp({ ...inp, gridKgPerKwh: v }); }} />
          <NumberField label="Years" allowEmpty={false} value={inp.years} onCommit={(v) => { if (v != null && v >= 1 && v <= 100) setInp({ ...inp, years: Math.round(v) }); }} />
        </div>
      </Card>
      <Card title="Where the carbon comes from">
        <Bars title="kgCO₂e by material" data={r.lines.map((l) => ({ label: l.label, value: l.kg }))} />
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Material</th><th>Quantity</th><th>Factor (kgCO₂e per unit)</th><th>Total kg</th></tr></thead><tbody>
          {r.lines.map((l) => <tr key={l.key} className="border-t border-ink-100"><td className="py-1">{l.label}</td><td>{l.quantity.toLocaleString("en-US", { maximumFractionDigits: 1 })} {l.unit}</td><td className="w-40"><NumberField label={`Factor for ${l.label}`} allowEmpty={false} step="0.01" value={inp.factors[l.key] ?? DEFAULT_CARBON_FACTORS[l.key].kg} onCommit={(v) => { if (v != null) setInp({ ...inp, factors: { ...inp.factors, [l.key]: v } }); }} /></td><td>{Math.round(l.kg).toLocaleString("en-US")}</td></tr>)}
        </tbody></table></div>
      </Card>
    </div>
  );
}
