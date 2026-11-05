"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { NEED_LABELS, AI_LIMITS, type AiBrief } from "@/lib/ai/plan";
import { applyOption, DEFAULT_AUTODESIGN_INPUT, type DesignOption } from "@/lib/layout/autodesign";
import { generateHouseWithFit } from "@/lib/layout/autodesignFit";
import { BUILDING_TYPE_LABELS } from "@/lib/model/defaults";
import { planToSvg } from "@/lib/export/svg";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { useWorkspace } from "@/lib/state/store";
import { btn, btnPrimary, inputCls, Label } from "../ui/Field";

interface Status { enabled: boolean; providers: Array<{ id: string; label: string }>; defaultProvider: string; dailyLimit: number }
interface Result { option: DesignOption; suggestions: string[]; provider: string; model: string; attempts: number }

/** Optional. Shown only when the owner has connected an AI service and the customer is logged in. */
export default function AiDesignCard({ onApplied }: { onApplied: () => void }) {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [status, setStatus] = useState<Status | null>(null);
  const [unavailable, setUnavailable] = useState("Checking whether an AI service is connected…");
  const [provider, setProvider] = useState("");
  const [bedrooms, setBedrooms] = useState("2");
  const [floors, setFloors] = useState(String(project.floors.length));
  const [needs, setNeeds] = useState<string[]>(["dining"]);
  const [notes, setNotes] = useState("");
  const [front, setFront] = useState<"bottom" | "top">("bottom");
  const [sf, setSf] = useState("0");
  const [sr, setSr] = useState("0");
  const [ss, setSs] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [floorIdx, setFloorIdx] = useState(0);

  useEffect(() => {
    let live = true;
    void api<Status>("/api/ai/status").then((r) => {
      if (!live) return;
      if (r.ok && r.data.enabled) {
        setStatus(r.data);
        setProvider(r.data.defaultProvider);
      } else if (r.ok) setUnavailable("No AI service is connected yet, or the owner switched AI mode off. Open Settings, then AI mode, paste a key in a service's box and press Save and connect.");
      else if (r.status === 401) setUnavailable("Log in to use AI mode.");
      else if (r.status === 503) setUnavailable("AI keys are stored in the database, which is not connected on this site yet (see ACCOUNTS_SETUP.md).");
      else setUnavailable(r.data.error ?? "Could not check the AI connection.");
    });
    return () => {
      live = false;
    };
  }, []);

  const preview = useMemo(() => {
    if (!res) return null;
    const applied = applyOption(project, res.option);
    const issues = validateProject(applied.project);
    return { project: applied.project, counts: countBySeverity(issues), warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message), failed: applied.failed };
  }, [res, project]);

  const live = !!status?.enabled;

  const generate = async () => {
    setBusy(true);
    setErr("");
    setRes(null);
    setFloorIdx(0);
    const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const brief: AiBrief = {
      buildingType: BUILDING_TYPE_LABELS[project.buildingType] ?? project.buildingType,
      floors: n(floors) || 1,
      bedrooms: n(bedrooms),
      needs,
      notes,
      frontSide: front,
      northAngle: project.northAngle ?? 0,
      setbackFront: n(sf),
      setbackRear: n(sr),
      setbackSide: n(ss),
      budget: project.targetBudget ?? null,
      unitSystem: project.unitSystem,
    };
    if (!live) {
      // no AI service available: same form, rule-based generator, clearly labelled
      const has = (k: string) => needs.includes(k);
      const out = generateHouseWithFit(project.plot, {
        ...DEFAULT_AUTODESIGN_INPUT,
        floors: Math.min(4, Math.max(1, brief.floors)),
        bedrooms: Math.min(5, Math.max(1, brief.bedrooms || 1)),
        includeDining: has("dining"), includeStudy: has("study"), includeGarage: has("garage") || has("parking"), includeBalcony: has("balcony") || has("terrace"), includeUtility: has("utility"),
        attachedBathMaster: has("attached-bath"), frontSide: front, setbackFront: brief.setbackFront, setbackRear: brief.setbackRear, setbackSide: brief.setbackSide, northAngle: brief.northAngle,
      });
      setBusy(false);
      if (!out.options.length) return setErr(out.errors.join(" ") || "Nothing fits this plot with these values.");
      const o = out.options[0];
      setRes({ option: { ...o, label: "Rule-based design (no AI connected)", notes: [...o.notes, "No AI service was available, so the rule-based generator made this from your form. Connect an AI service in Settings to get AI designs."] }, suggestions: [], provider: "Rule-based generator", model: "built-in", attempts: 1 });
      return;
    }
    const r = await api<Result>("/api/ai/design", "POST", { provider, plot: project.plot, brief });
    setBusy(false);
    if (r.ok) setRes(r.data);
    else setErr(r.data.error ?? "The AI request failed.");
  };

  const use = () => {
    if (!res) return;
    const hasWork = project.floors.some((f) => f.rooms.length > 0);
    if (hasWork && !window.confirm("This replaces all rooms, walls, doors and windows in the current design. You can undo it with Ctrl+Z. Continue?")) return;
    const { project: next, failed } = applyOption(ws.getState().project, res.option);
    ws.commit(next);
    ws.setActiveFloor(next.floors[0].id);
    ws.notify(failed.length ? `AI design applied, but ${failed.length} opening(s) could not be placed.` : "AI design applied. Everything is editable, and Undo restores your previous design.");
    onApplied();
  };

  const toggle = (k: string) => setNeeds((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));
  const fl = preview ? preview.project.floors[Math.min(floorIdx, preview.project.floors.length - 1)] : null;

  return (
    <section className="rounded-lg border border-brand-200 bg-brand-50/40 p-4" aria-labelledby="ai-h">
      <h2 id="ai-h" className="text-lg font-semibold">AI mode (optional)</h2>
      <p className="mt-1 text-sm text-ink-600">
        Fill in your needs and an AI service suggests a floor plan for this plot. It works only for building layouts in this software. Its answer is checked (inside the plot, no overlaps, every room reachable by a door) and then drawn like any other design, so you can edit it. <strong>AI can make mistakes; this is a concept, not an approved drawing.</strong>
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!live && <p role="status" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{unavailable} Until then, the button below builds a design with the built-in rule-based generator from the same form.</p>}
      {live && status!.providers.length > 1 && (
          <div>
            <Label htmlFor="ai-prov">AI service</Label>
            <select id="ai-prov" className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
              {status!.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        )}
        <div><Label htmlFor="ai-fl">Floors (1–{AI_LIMITS.floors})</Label><input id="ai-fl" className={inputCls} type="number" min={1} max={AI_LIMITS.floors} value={floors} onChange={(e) => setFloors(e.target.value)} /></div>
        <div><Label htmlFor="ai-bd">Bedrooms</Label><input id="ai-bd" className={inputCls} type="number" min={0} max={12} value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} /></div>
        <div>
          <Label htmlFor="ai-front">Street side of the plot</Label>
          <select id="ai-front" className={inputCls} value={front} onChange={(e) => setFront(e.target.value as "top" | "bottom")}>
            <option value="bottom">Bottom edge of the plan</option>
            <option value="top">Top edge of the plan</option>
          </select>
        </div>
        <div><Label htmlFor="ai-sf">Front setback (m)</Label><input id="ai-sf" className={inputCls} inputMode="decimal" value={sf} onChange={(e) => setSf(e.target.value)} /></div>
        <div><Label htmlFor="ai-sr">Rear setback (m)</Label><input id="ai-sr" className={inputCls} inputMode="decimal" value={sr} onChange={(e) => setSr(e.target.value)} /></div>
        <div><Label htmlFor="ai-ss">Side setbacks (m)</Label><input id="ai-ss" className={inputCls} inputMode="decimal" value={ss} onChange={(e) => setSs(e.target.value)} /></div>
      </div>
      <fieldset className="mt-3">
        <legend className="mb-1 text-xs font-semibold text-ink-700">What do you need?</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(NEED_LABELS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={needs.includes(k)} onChange={() => toggle(k)} /> {label.replace(/ \(.*\)$/, "")}</label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3">
        <Label htmlFor="ai-notes">Anything else (optional, max {AI_LIMITS.notes} characters)</Label>
        <textarea id="ai-notes" rows={3} maxLength={AI_LIMITS.notes} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Example: a family of five, elderly parents need a ground-floor bedroom, large kitchen, plenty of light" />
      </div>
      <p className="mt-2 text-xs text-ink-500">The AI also gets your plot ({project.plot.width.toFixed(1)} × {project.plot.depth.toFixed(1)} m{project.plot.polygon ? ", shaped" : ""}), building type, north direction and budget from the project. Each design counts against the daily limit ({status?.dailyLimit ?? 20}).</p>
      <div className="mt-3"><button className={btnPrimary} disabled={busy} onClick={() => void generate()}>{busy ? "Designing… this can take up to a minute" : live ? "Create with AI" : "Create design from this form"}</button></div>
      {err && <div role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}
      {res && preview && fl && (
        <article className="mt-4 rounded-lg border border-ink-200 bg-white p-3" aria-label="AI design">
          <h3 className="font-semibold">{res.option.label}</h3>
          <p className="text-xs text-ink-600">{res.option.summary}. Built-up {res.option.builtUpArea.toFixed(0)} m² over {res.option.floors.length} floor(s). Made by {res.provider} ({res.model}).</p>
          <div className="my-2 flex gap-1" role="group" aria-label="Preview floor">
            {res.option.floors.map((_, i) => (
              <button key={i} className={`${btn} ${floorIdx === i ? "ring-2 ring-brand-500" : ""}`} onClick={() => setFloorIdx(i)}>{i === 0 ? "Ground floor" : `Floor ${i + 1}`}</button>
            ))}
          </div>
          <div className="overflow-hidden rounded border border-ink-100 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: planToSvg(preview.project, fl.id, { showTitleBlock: false }) }} />
          <p className="mt-1 text-xs">
            {preview.counts.error === 0 ? <span className="text-emerald-700">No geometry errors</span> : <span className="font-semibold text-red-700">{preview.counts.error} error(s)</span>}
            {preview.counts.warning > 0 && <span className="text-amber-800"> · {preview.counts.warning} warning(s)</span>}
          </p>
          {res.suggestions.length > 0 && (
            <div className="mt-2 rounded-md bg-brand-50 p-2 text-sm">
              <p className="font-semibold">AI suggestions</p>
              <ul className="list-disc pl-5 text-xs text-ink-700">{res.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {(preview.warnings.length > 0 || res.option.notes.length > 0) && (
            <ul className="mt-2 list-disc pl-4 text-xs text-amber-900">{[...preview.warnings, ...res.option.notes].slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
          <div className="mt-3 flex gap-2"><button className={btnPrimary} onClick={use}>Use this design</button><button className={btn} onClick={() => void generate()} disabled={busy}>Try again</button></div>
        </article>
      )}
    </section>
  );
}
