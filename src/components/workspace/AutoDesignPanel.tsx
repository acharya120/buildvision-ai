"use client";

import { useMemo, useState } from "react";
import { applyOption, AUTODESIGN_LIMITS, DEFAULT_AUTODESIGN_INPUT, generateOptions, type AutoDesignInput, type DesignOption, type Sizing } from "@/lib/layout/autodesign";
import { COMMERCIAL_PRESETS, DEFAULT_COMMERCIAL_INPUT, generateCommercialOptions, type CommercialInput } from "@/lib/layout/autodesignCorridor";
import { ROOM_TYPES, ROOM_TYPE_LABELS } from "@/lib/model/defaults";
import type { RoomType } from "@/lib/model/types";
import { planToSvg } from "@/lib/export/svg";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { useWorkspace } from "@/lib/state/store";
import { btn, btnPrimary, inputCls, Label } from "../ui/Field";

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default function AutoDesignPanel({ onApplied }: { onApplied: () => void }) {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [input, setInput] = useState<AutoDesignInput>({ ...DEFAULT_AUTODESIGN_INPUT, floors: project.floors.length });
  const [result, setResult] = useState<{ options: DesignOption[]; errors: string[] } | null>(null);
  const [floorIdx, setFloorIdx] = useState(0);
  const resid = ["single-floor", "duplex", "triplex", "bungalow", "villa", "apartment", "farmhouse", "custom"].includes(project.buildingType);
  const [mode, setMode] = useState<"house" | "corridor">(resid ? "house" : "corridor");
  const [cin, setCin] = useState<CommercialInput>({ ...DEFAULT_COMMERCIAL_INPUT, ...(COMMERCIAL_PRESETS[project.buildingType] ?? {}), floors: project.floors.length });
  const setC = <K extends keyof CommercialInput>(k: K, v: CommercialInput[K]) => setCin((i) => ({ ...i, [k]: v }));
  const cnum = (k: "floors" | "roomsPerFloor" | "roomWidth" | "roomDepth" | "floorHeight" | "setbackFront" | "setbackRear" | "setbackSide", v: string) => setC(k, v.trim() === "" ? NaN : Number(v));
  const set = <K extends keyof AutoDesignInput>(k: K, v: AutoDesignInput[K]) => setInput((i) => ({ ...i, [k]: v }));
  const num = (k: "floors" | "bedrooms" | "setbackFront" | "setbackRear" | "setbackSide", v: string) => set(k, v.trim() === "" ? NaN : Number(v));

  const previews = useMemo(() => {
    if (!result) return [];
    return result.options.map((o) => {
      const applied = applyOption(project, o);
      const issues = validateProject(applied.project);
      return { option: o, project: applied.project, counts: countBySeverity(issues), warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message), failed: applied.failed };
    });
  }, [result, project]);

  const generate = () => {
    setFloorIdx(0);
    setResult(mode === "house" ? generateOptions(project.plot, input) : generateCommercialOptions(project.plot, cin));
  };

  const use = (o: DesignOption) => {
    const hasWork = project.floors.some((f) => f.rooms.length > 0);
    if (hasWork && !window.confirm("This replaces all rooms, walls, doors and windows in the current design. You can undo it with Ctrl+Z. Continue?")) return;
    const { project: next, failed } = applyOption(ws.getState().project, o);
    ws.commit(next);
    ws.setActiveFloor(next.floors[0].id);
    ws.notify(failed.length ? `Design applied, but ${failed.length} opening(s) could not be placed.` : "Design applied. Everything is editable, and Undo restores your previous design.");
    onApplied();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="ad-h">
        <h2 id="ad-h" className="text-lg font-semibold">Auto design (rule-based concept generator)</h2>
        <p className="mt-1 text-sm text-ink-600">
          Generates up to three concept layouts for your plot from fixed layout rules: rooms in bands, a stacked stair and bathroom core, a hall where needed, doors so every room can be entered, and windows on outside walls.
          <strong> It is not AI and not an architect.</strong> It does not know orientation, ventilation or structural rules, local regulations, or your site. Enter your own setbacks. All results are starting points that you can edit.
        </p>
        <div className="mt-3 flex gap-2" role="group" aria-label="Building category">
          <button className={`${btn} ${mode === "house" ? "ring-2 ring-brand-500" : ""}`} onClick={() => setMode("house")}>House / flat</button>
          <button className={`${btn} ${mode === "corridor" ? "ring-2 ring-brand-500" : ""}`} onClick={() => setMode("corridor")}>Office, hotel, school, hospital, shop, warehouse…</button>
        </div>
        {mode === "corridor" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="c-type">Repeated room type</Label>
              <select id="c-type" className={inputCls} value={cin.roomType} onChange={(e) => setC("roomType", e.target.value as RoomType)}>
                {ROOM_TYPES.filter((t) => !["staircase", "lift", "corridor", "toilet", "lobby"].includes(t)).map((t) => <option key={t} value={t}>{ROOM_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div><Label htmlFor="c-fl">Floors (1–100)</Label><input id="c-fl" className={inputCls} type="number" min={1} max={100} value={Number.isNaN(cin.floors) ? "" : cin.floors} onChange={(e) => cnum("floors", e.target.value)} /></div>
            <div><Label htmlFor="c-n">Rooms per floor (0 = as many as fit)</Label><input id="c-n" className={inputCls} type="number" min={0} max={400} value={Number.isNaN(cin.roomsPerFloor) ? "" : cin.roomsPerFloor} onChange={(e) => cnum("roomsPerFloor", e.target.value)} /></div>
            <div><Label htmlFor="c-h">Floor height (m)</Label><input id="c-h" className={inputCls} inputMode="decimal" value={Number.isNaN(cin.floorHeight) ? "" : cin.floorHeight} onChange={(e) => cnum("floorHeight", e.target.value)} /></div>
            <div><Label htmlFor="c-w">Room width (m)</Label><input id="c-w" className={inputCls} inputMode="decimal" value={Number.isNaN(cin.roomWidth) ? "" : cin.roomWidth} onChange={(e) => cnum("roomWidth", e.target.value)} /></div>
            <div><Label htmlFor="c-d">Room depth (m)</Label><input id="c-d" className={inputCls} inputMode="decimal" value={Number.isNaN(cin.roomDepth) ? "" : cin.roomDepth} onChange={(e) => cnum("roomDepth", e.target.value)} /></div>
            <div><Label htmlFor="c-sf">Front setback (m)</Label><input id="c-sf" className={inputCls} inputMode="decimal" value={Number.isNaN(cin.setbackFront) ? "" : cin.setbackFront} onChange={(e) => cnum("setbackFront", e.target.value)} /></div>
            <div><Label htmlFor="c-sr">Rear setback (m)</Label><input id="c-sr" className={inputCls} inputMode="decimal" value={Number.isNaN(cin.setbackRear) ? "" : cin.setbackRear} onChange={(e) => cnum("setbackRear", e.target.value)} /></div>
            <div><Label htmlFor="c-ss">Side setbacks (m)</Label><input id="c-ss" className={inputCls} inputMode="decimal" value={Number.isNaN(cin.setbackSide) ? "" : cin.setbackSide} onChange={(e) => cnum("setbackSide", e.target.value)} /></div>
            <div className="space-y-1.5 pt-1">
              <Check id="c-lift" label="Lift (multi-floor)" checked={cin.includeLift} onChange={(v) => setC("includeLift", v)} />
              <Check id="c-rec" label="Reception on ground floor" checked={cin.groundReception} onChange={(v) => setC("groundReception", v)} />
            </div>
            <p className="text-xs text-ink-500 sm:col-span-2 lg:col-span-4">Layout: a corridor with a row of rooms on each side, stair, lift and toilets at one end. No fire-exit, accessibility or code rules are applied; those need a professional.</p>
          </div>
        )}
        <div className={`mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${mode === "corridor" ? "hidden" : ""}`}>
          <div>
            <Label htmlFor="ad-floors">Floors ({AUTODESIGN_LIMITS.floors[0]}–{AUTODESIGN_LIMITS.floors[1]})</Label>
            <input id="ad-floors" className={inputCls} type="number" min={1} max={4} value={Number.isNaN(input.floors) ? "" : input.floors} onChange={(e) => num("floors", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ad-beds">Bedrooms ({AUTODESIGN_LIMITS.bedrooms[0]}–{AUTODESIGN_LIMITS.bedrooms[1]})</Label>
            <input id="ad-beds" className={inputCls} type="number" min={1} max={5} value={Number.isNaN(input.bedrooms) ? "" : input.bedrooms} onChange={(e) => num("bedrooms", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ad-front">Street side of the plot</Label>
            <select id="ad-front" className={inputCls} value={input.frontSide} onChange={(e) => set("frontSide", e.target.value as "top" | "bottom")}>
              <option value="bottom">Bottom edge of the plan</option>
              <option value="top">Top edge of the plan</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ad-size">Room sizes</Label>
            <select id="ad-size" className={inputCls} value={input.sizing} onChange={(e) => set("sizing", e.target.value as Sizing)}>
              <option value="standard">Standard (near usual sizes)</option>
              <option value="spacious">Spacious (up to ~1.7x)</option>
              <option value="fill">Fill the buildable area</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ad-sf">Front setback (m)</Label>
            <input id="ad-sf" className={inputCls} inputMode="decimal" value={Number.isNaN(input.setbackFront) ? "" : input.setbackFront} onChange={(e) => num("setbackFront", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ad-sr">Rear setback (m)</Label>
            <input id="ad-sr" className={inputCls} inputMode="decimal" value={Number.isNaN(input.setbackRear) ? "" : input.setbackRear} onChange={(e) => num("setbackRear", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ad-ss">Side setbacks (m, each side)</Label>
            <input id="ad-ss" className={inputCls} inputMode="decimal" value={Number.isNaN(input.setbackSide) ? "" : input.setbackSide} onChange={(e) => num("setbackSide", e.target.value)} />
          </div>
          <div className="space-y-1.5 pt-1">
            <Check id="ad-dining" label="Separate dining room" checked={input.includeDining} onChange={(v) => set("includeDining", v)} />
            <Check id="ad-garage" label="Garage" checked={input.includeGarage} onChange={(v) => set("includeGarage", v)} />
            <Check id="ad-study" label="Study room" checked={input.includeStudy} onChange={(v) => set("includeStudy", v)} />
            <Check id="ad-balc" label="Balcony on upper floors" checked={input.includeBalcony} onChange={(v) => set("includeBalcony", v)} />
            <Check id="ad-util" label="Utility room" checked={input.includeUtility} onChange={(v) => set("includeUtility", v)} />
            <Check id="ad-att" label="Bathroom next to master bedroom" checked={input.attachedBathMaster} onChange={(v) => set("attachedBathMaster", v)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-500">Plot: {project.plot.width.toFixed(2)} × {project.plot.depth.toFixed(2)} m. Setbacks are left at 0 until you enter your own; the app does not know your local rules.</p>
        <div className="mt-3"><button className={btnPrimary} onClick={generate}>Generate designs</button></div>
      </section>

      {result && result.errors.length > 0 && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {result.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {previews.length > 0 && (
        <section aria-label="Generated options">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">Options</h3>
            <div className="flex gap-1" role="group" aria-label="Preview floor">
              {previews[0].option.floors.map((_, i) => (
                <button key={i} className={`${btn} ${floorIdx === i ? "ring-2 ring-brand-500" : ""}`} onClick={() => setFloorIdx(i)}>
                  {i === 0 ? "Ground floor" : `Floor ${i + 1}`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {previews.map((pv) => {
              const fl = pv.project.floors[Math.min(floorIdx, pv.project.floors.length - 1)];
              const svg = planToSvg(pv.project, fl.id, { showTitleBlock: false });
              return (
                <article key={pv.option.id} className="flex flex-col rounded-lg border border-ink-200 bg-white p-3" aria-label={pv.option.label}>
                  <h4 className="font-semibold">{pv.option.label}</h4>
                  <p className="text-xs text-ink-600">{pv.option.summary}. Built-up {pv.option.builtUpArea.toFixed(0)} m² over {pv.option.floors.length} floor(s).</p>
                  <div className="my-2 overflow-hidden rounded border border-ink-100 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                  <p className="text-xs">
                    {pv.counts.error === 0 ? <span className="text-emerald-700">No geometry errors</span> : <span className="font-semibold text-red-700">{pv.counts.error} error(s)</span>}
                    {pv.counts.warning > 0 && <span className="text-amber-800"> · {pv.counts.warning} warning(s)</span>}
                  </p>
                  {(pv.warnings.length > 0 || pv.option.notes.length > 0) && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">
                      {[...pv.warnings, ...pv.option.notes].slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  <button className={`${btnPrimary} mt-auto`} onClick={() => use(pv.option)}>Use this design</button>
                </article>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-500">Options are ranked by simple heuristics (room proportions, sizes, kitchen next to living) which do not measure how good a home is.</p>
        </section>
      )}
    </div>
  );
}
