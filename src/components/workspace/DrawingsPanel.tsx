"use client";

import { useMemo, useState } from "react";
import { getFloor } from "@/lib/model/ops";
import { buildElevation, buildSection, drawingToSvg, type Side } from "@/lib/export/drawings";
import { planToSvg } from "@/lib/export/svg";
import { openingScheduleCsv, roomScheduleCsv } from "@/lib/export/csv";
import { downloadBlob, downloadText, safeFileName, svgToPngBlob } from "@/lib/export/download";
import { buildObj } from "@/lib/export/obj";
import { buildPdf } from "@/lib/export/pdf";
import { serializeProject } from "@/lib/model/schema";
import { formatArea, formatLength } from "@/lib/model/units";
import { ROOM_TYPE_LABELS } from "@/lib/model/defaults";
import { useWorkspace } from "@/lib/state/store";
import { btn, btnPrimary, Disclaimer, inputCls, Label } from "../ui/Field";

type View = "plan" | "elevation" | "section" | "schedule";

export default function DrawingsPanel() {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const floor = getFloor(project, activeFloorId) ?? project.floors[0];
  const sys = project.unitSystem;
  const [view, setView] = useState<View>("plan");
  const [side, setSide] = useState<Side>("south");
  const [axis, setAxis] = useState<"x" | "y">("y");
  const [at, setAt] = useState(project.plot.depth / 2);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planSvg = useMemo(() => planToSvg(project, floor.id), [project, floor.id]);
  const elevSvg = useMemo(() => drawingToSvg(buildElevation(project, side), project), [project, side]);
  const maxAt = axis === "y" ? project.plot.depth : project.plot.width;
  const clampedAt = Math.min(Math.max(0, at), maxAt);
  const secSvg = useMemo(() => drawingToSvg(buildSection(project, axis, clampedAt), project), [project, axis, clampedAt]);
  const name = safeFileName(project.name);

  const current = view === "plan" ? planSvg : view === "elevation" ? elevSvg : secSvg;
  const currentName = view === "plan" ? `${name}-${safeFileName(floor.name)}-plan` : view === "elevation" ? `${name}-elevation-${side}` : `${name}-section`;

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["plan", "Floor plan"], ["elevation", "Elevation"], ["section", "Section"], ["schedule", "Schedules"]] as Array<[View, string]>).map(([v, label]) => (
          <button key={v} className={`${btn} ${view === v ? "!border-brand-600 !bg-brand-50 !text-brand-700" : ""}`} aria-pressed={view === v} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
        <span className="text-xs text-ink-500">Drawn from the same model as the plan editor.</span>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {view !== "schedule" && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {view === "plan" && <p className="text-sm text-ink-600">Floor: <strong>{floor.name}</strong> (change the floor in the Plan tab)</p>}
            {view === "elevation" && (
              <div>
                <Label htmlFor="side">View from</Label>
                <select id="side" className={inputCls} value={side} onChange={(e) => setSide(e.target.value as Side)}>
                  <option value="south">South (bottom of plan)</option>
                  <option value="north">North (top of plan)</option>
                  <option value="east">East (right of plan)</option>
                  <option value="west">West (left of plan)</option>
                </select>
              </div>
            )}
            {view === "section" && (
              <>
                <div>
                  <Label htmlFor="axis">Cut line</Label>
                  <select id="axis" className={inputCls} value={axis} onChange={(e) => { const a = e.target.value as "x" | "y"; setAxis(a); setAt((a === "y" ? project.plot.depth : project.plot.width) / 2); }}>
                    <option value="y">Horizontal line (constant y)</option>
                    <option value="x">Vertical line (constant x)</option>
                  </select>
                </div>
                <div className="min-w-[220px]">
                  <Label htmlFor="at">Cut position: {formatLength(clampedAt, sys)}</Label>
                  <input id="at" type="range" className="w-full" min={0} max={maxAt} step={0.05} value={clampedAt} onChange={(e) => setAt(Number(e.target.value))} />
                </div>
              </>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <button className={btn} onClick={() => downloadText(current, `${currentName}.svg`, "image/svg+xml")}>Download SVG</button>
              <button className={btn} disabled={busy !== null} onClick={() => run("png", async () => downloadBlob(await svgToPngBlob(current), `${currentName}.png`))}>
                {busy === "png" ? "Working…" : "Download PNG"}
              </button>
            </div>
          </div>
          <div className="overflow-auto rounded-lg border border-ink-200 bg-white p-2">
            {/* the SVG is generated by our own code with all text escaped */}
            <div className="mx-auto w-fit max-w-full [&>svg]:h-auto [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: current }} />
          </div>
          {view !== "plan" && <p className="text-xs text-ink-500">Elevations and sections are simplified: they show floor heights, footprints, rooms, and modelled doors and windows. They do not show roofs, materials, levels of the plot, or structure.</p>}
        </>
      )}

      {view === "schedule" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-semibold">Room schedule</h2>
            <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-ink-50 text-left text-xs text-ink-600"><tr><th className="p-2">Floor</th><th className="p-2">Room</th><th className="p-2">Type</th><th className="p-2">Width × Depth</th><th className="p-2 text-right">Area</th></tr></thead>
                <tbody>
                  {project.floors.flatMap((f) => f.rooms.map((r) => (
                    <tr key={r.id} className="border-t border-ink-100">
                      <td className="p-2">{f.name}</td><td className="p-2">{r.name}</td><td className="p-2">{ROOM_TYPE_LABELS[r.type]}</td>
                      <td className="p-2">{formatLength(r.width, sys)} × {formatLength(r.depth, sys)}</td><td className="p-2 text-right">{formatArea(r.width * r.depth, sys)}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            <button className={`${btn} mt-2`} onClick={() => downloadText(roomScheduleCsv(project), `${name}-rooms.csv`, "text/csv")}>Download room schedule (CSV)</button>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Door and window schedule</h2>
            {project.floors.every((f) => f.openings.length === 0) ? (
              <p className="rounded-md border border-dashed border-ink-300 p-3 text-sm text-ink-500">No doors or windows modelled yet. Add them with the Add door / Add window tools in the Plan tab.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-ink-50 text-left text-xs text-ink-600"><tr><th className="p-2">Floor</th><th className="p-2">Type</th><th className="p-2">Width</th><th className="p-2">Height</th><th className="p-2">Sill</th></tr></thead>
                  <tbody>
                    {project.floors.flatMap((f) => f.openings.map((o) => (
                      <tr key={o.id} className="border-t border-ink-100"><td className="p-2">{f.name}</td><td className="p-2">{o.kind === "door" ? "Door" : "Window"}</td><td className="p-2">{formatLength(o.width, sys)}</td><td className="p-2">{formatLength(o.height, sys)}</td><td className="p-2">{formatLength(o.sill, sys)}</td></tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
            <button className={`${btn} mt-2`} onClick={() => downloadText(openingScheduleCsv(project), `${name}-openings.csv`, "text/csv")}>Download opening schedule (CSV)</button>
          </section>
        </div>
      )}

      <section className="rounded-lg border border-ink-200 bg-white p-4" aria-labelledby="exp-h">
        <h2 id="exp-h" className="mb-1 font-semibold">Export the whole project</h2>
        <p className="mb-3 text-sm text-ink-600">The PDF is a vector drawing (one dimensioned sheet per floor on A3 landscape) followed by schedules, the estimate and the disclaimer.</p>
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={busy !== null} onClick={() => run("pdf", async () => downloadBlob(await buildPdf(project), `${name}.pdf`))}>
            {busy === "pdf" ? "Building PDF…" : "Download PDF"}
          </button>
          <button className={btn} onClick={() => downloadText(serializeProject(project), `${name}.buildvision.json`, "application/json")}>Download backup (JSON)</button>
          <button className={btn} onClick={() => downloadText(buildObj(project), `${name}.obj`, "text/plain")}>Download 3D model (OBJ)</button>
        </div>
      </section>
      <Disclaimer compact />
    </div>
  );
}
