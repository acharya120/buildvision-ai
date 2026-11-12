"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { useStored } from "@/lib/analysis/useStored";
import { downloadText, safeFileName } from "@/lib/export/download";
import { exportIfc } from "@/lib/bim/ifcWrite";
import { importIfc, validateIfc, type IfcImport } from "@/lib/bim/ifcRead";
import { projectFromFloors, type NewFloor } from "@/lib/bim/toProject";
import { saveProject } from "@/lib/storage/local";
import { buildGrid, contoursSvg, cutFill, footprintMask, parseSpots, slopeStats } from "@/lib/survey/topo";
import { detectRooms, parseCloud, yUpToZUp, type Detection } from "@/lib/survey/pointcloud";
import { analyzeBeam, buildFrame, defaultSections, frameCsv, staadText, type BeamInput, type Support } from "@/lib/structural/handoff";
import { buildStructure } from "@/lib/structure/structure";
import { btn, btnPrimary, inputCls } from "../ui/Field";
import { Card, SvgDownloads, SvgView } from "../studio/shared";
import { Pill, Stat } from "../analysis/common";
import { PrelimBanner } from "../engineering/common";
import { Num, Sel, Txt, fmt } from "../sitemgmt/ui";

const MAX_BYTES = 120 * 1024 * 1024;
async function readFile(f: File): Promise<string | { error: string }> {
  if (f.size > MAX_BYTES) return { error: `That file is ${(f.size / 1048576).toFixed(0)} MB. The limit here is 120 MB; crop or thin the scan first.` };
  try { return await f.text(); } catch { return { error: "The file could not be read." }; }
}
function NewProjectLink({ id }: { id: string }) {
  return <p role="status" className="mt-2 text-sm">New project created and saved in this browser. <a className="font-medium text-brand-700 underline" href={`/project/${id}`}>Open it</a> (your current project is unchanged).</p>;
}

export function IfcPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [withStructure, setWithStructure] = useState(false);
  const [imp, setImp] = useState<IfcImport | null>(null);
  const [impErr, setImpErr] = useState("");
  const [created, setCreated] = useState("");
  const out = useMemo(() => exportIfc(project, { includeStructure: withStructure }), [project, withStructure]);
  const check = useMemo(() => validateIfc(out.text), [out.text]);
  const onFile = async (f: File | undefined) => {
    setImp(null); setImpErr(""); setCreated("");
    if (!f) return;
    const t = await readFile(f);
    if (typeof t !== "string") { setImpErr(t.error); return; }
    if (!/ISO-10303-21/.test(t.slice(0, 200))) { setImpErr("That does not look like an IFC (STEP) text file."); return; }
    setImp(importIfc(t));
  };
  const create = () => {
    if (!imp) return;
    const floors: NewFloor[] = imp.floors.map((f) => ({ name: f.name, height: f.height, rooms: f.rooms }));
    const r = projectFromFloors(`${project.name} (IFC import)`, floors);
    if ("error" in r) { setImpErr(r.error); return; }
    saveProject(r.project);
    setCreated(r.project.id);
  };
  return (
    <div className="space-y-4">
      <Card title="IFC export (BIM interoperability)">
        <PrelimBanner>Writes an IFC4 file with storeys, walls, doors, windows (with openings), floor slabs and room spaces, in metres, from your plan. It is a simple geometric model, not an engineered or certified BIM. An independent IFC validator was not available where this was built, so the file is only checked by this app&apos;s own structural check below. Open it in a free IFC viewer (for example BIMvision, FreeCAD or BlenderBIM) and confirm it before sharing.</PrelimBanner>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={withStructure} onChange={(e) => setWithStructure(e.target.checked)} /> Include the indicative columns and beams (not an engineered frame)</label>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Storeys" value={String(out.counts.IFCBUILDINGSTOREY ?? 0)} /><Stat label="Walls" value={String(out.counts.IFCWALL ?? 0)} /><Stat label="Doors + windows" value={String((out.counts.IFCDOOR ?? 0) + (out.counts.IFCWINDOW ?? 0))} /><Stat label="Rooms (spaces)" value={String(out.counts.IFCSPACE ?? 0)} /></div>
        <p className="text-sm">App self-check: <Pill tone={check.ok ? "good" : "bad"}>{check.ok ? `passed (${check.entityCount} entities)` : "problems found"}</Pill></p>
        {check.errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-red-700">{check.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {out.warnings.map((w, i) => <p key={i} className="mt-1 text-sm text-amber-800">{w}</p>)}
        <div className="mt-3"><button className={btnPrimary} disabled={!check.ok} onClick={() => downloadText(out.text, `${safeFileName(project.name)}.ifc`, "application/x-step")}>Download IFC</button></div>
      </Card>
      <Card title="IFC import (limited)">
        <PrelimBanner>Reads storeys, rooms (IfcSpace) and walls whose shape is a simple extruded rectangle, such as files made by this app. Files from Revit or ArchiCAD usually use richer geometry, so expect partial results. Doors and windows are not imported. The result becomes a NEW project; your current one is never changed.</PrelimBanner>
        <label className="mt-3 block text-sm">Choose an .ifc file<input type="file" accept=".ifc,.txt" className={inputCls} onChange={(e) => void onFile(e.target.files?.[0])} /></label>
        {impErr && <p role="alert" className="mt-2 text-sm text-red-700">{impErr}</p>}
        {imp && (
          <div className="mt-3 space-y-2 text-sm">
            {imp.floors.length === 0 ? <p>Nothing could be imported.</p> : <ul className="list-disc pl-5">{imp.floors.map((f, i) => <li key={i}>{f.name}: {f.rooms.length} room(s), {f.walls.length} wall(s), level {f.elevation} m</li>)}</ul>}
            {Object.keys(imp.skipped).length > 0 && <p className="text-amber-800">Skipped: {Object.entries(imp.skipped).map(([k, v]) => `${v} × ${k}`).join("; ")}.</p>}
            {imp.warnings.map((w, i) => <p key={i} className="text-ink-600">{w}</p>)}
            {imp.floors.some((f) => f.rooms.length) && <button className={btnPrimary} onClick={create}>Create a new project from these rooms</button>}
            {created && <NewProjectLink id={created} />}
          </div>
        )}
      </Card>
    </div>
  );
}

const SAMPLE_SPOTS = "# x, y, ground level (m); x right, y down in your plan\n0,0,100.0\n12,0,100.4\n0,9,100.9\n12,9,101.5\n6,4,100.6";
export function TopoPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [st, setSt] = useStored(project.id, "topo", { text: "", interval: 0.25, level: null as number | null });
  const [err, setErr] = useState("");
  const parsed = useMemo(() => parseSpots(st.text), [st.text]);
  const grid = useMemo(() => buildGrid(parsed.spots, project.plot.width, project.plot.depth), [parsed.spots, project.plot.width, project.plot.depth]);
  const slope = useMemo(() => (grid ? slopeStats(grid) : null), [grid]);
  const pad = useMemo(() => (grid && st.level != null ? cutFill(grid, st.level, footprintMask(project)) : null), [grid, st.level, project]);
  const plot = useMemo(() => (grid && st.level != null ? cutFill(grid, st.level) : null), [grid, st.level]);
  const svg = useMemo(() => (grid ? contoursSvg(project, grid, st.interval, st.level) : ""), [grid, project, st.interval, st.level]);
  return (
    <div className="space-y-4">
      <Card title="Topography and site levels">
        <PrelimBanner>Contours, slope and earthwork volumes are interpolated from the spot levels YOU enter (from a site survey). They are not a survey, and the volumes ignore topsoil, swell, shrinkage and slopes of excavation. Pulling ground levels automatically from a map or elevation service needs an outside API and is not included.</PrelimBanner>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className="block text-sm"><span className="text-xs text-ink-600">Spot levels: x, y, level per line (metres, plot corner = 0,0)</span><textarea className={`${inputCls} h-40 font-mono text-xs`} value={st.text} onChange={(e) => setSt({ ...st, text: e.target.value })} /></label>
          <div className="space-y-2">
            <label className="block text-sm">Or load a CSV file<input type="file" accept=".csv,.txt" className={inputCls} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const t = await readFile(f); if (typeof t === "string") { setSt({ ...st, text: t }); setErr(""); } else setErr(t.error); }} /></label>
            {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
            <button className={btn} onClick={() => setSt({ ...st, text: SAMPLE_SPOTS })}>Insert example levels</button>
            <div className="grid grid-cols-2 gap-3"><Num label="Contour interval (m)" value={st.interval} onChange={(v) => v && setSt({ ...st, interval: v })} /><Num label="Formation level (m), optional" allowEmpty min={-1e6} value={st.level} onChange={(v) => setSt({ ...st, level: v })} /></div>
            <p className="text-sm">{parsed.spots.length} spot level(s) read.{parsed.spots.length < 3 && " At least 3 are needed."}</p>
            {parsed.errors.map((e, i) => <p key={i} className="text-xs text-amber-800">{e}</p>)}
          </div>
        </div>
      </Card>
      {grid && slope && (
        <Card title="Results">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Lowest / highest ground" value={`${slope.lowest.toFixed(2)} / ${slope.highest.toFixed(2)} m`} /><Stat label="Mean slope" value={`${slope.meanPct.toFixed(1)}%`} /><Stat label="Steepest" value={`${slope.maxPct.toFixed(0)}%`} /><Stat label="Flat / moderate / steep" value={`${slope.flatPct.toFixed(0)} / ${slope.moderatePct.toFixed(0)} / ${slope.steepPct.toFixed(0)}%`} /></div>
          <p className="mt-1 text-xs text-ink-600">Bands are rule-of-thumb: flat under 5%, moderate 5–15%, steep over 15%. Your local rules may differ.</p>
          <div className="mt-3"><SvgView svg={svg} label="Contour map" /></div>
          <div className="mt-3"><SvgDownloads svg={svg} base="contours" /></div>
          {pad && plot && (<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Building pad: cut" value={`${fmt(pad.cutM3)} m³`} /><Stat label="Building pad: fill" value={`${fmt(pad.fillM3)} m³`} /><Stat label="Whole plot: cut" value={`${fmt(plot.cutM3)} m³`} /><Stat label="Whole plot: fill" value={`${fmt(plot.fillM3)} m³`} /></div>)}
          {st.level == null && <p className="mt-2 text-sm text-ink-600">Enter a formation level to get cut and fill volumes.</p>}
        </Card>
      )}
    </div>
  );
}

function roomsSvg(d: Detection): string {
  const W = Math.max(d.width, 1), D = Math.max(d.depth, 1), fs = Math.max(W, D) / 45, pad = fs * 2;
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}" font-family="sans-serif"><rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${D + pad * 2}" fill="#fff"/>`];
  d.rooms.forEach((r, i) => o.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.depth}" fill="#f6f1e6" stroke="#1f2430" stroke-width="${fs / 6}"/><text x="${r.x + fs / 2}" y="${r.y + fs * 1.4}" font-size="${fs}" fill="#1f2430">Room ${i + 1}: ${r.width} × ${r.depth} m</text>`));
  o.push("</svg>");
  return o.join("");
}
export function ScanPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [scale, setScale] = useState("1");
  const [yUp, setYUp] = useState(false);
  const [cell, setCell] = useState(0.05);
  const [gap, setGap] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [det, setDet] = useState<Detection | null>(null);
  const [info, setInfo] = useState("");
  const [created, setCreated] = useState("");
  const run = async (f: File | undefined) => {
    setDet(null); setMsg(""); setCreated(""); setInfo("");
    if (!f) return;
    setBusy(true);
    const t = await readFile(f);
    if (typeof t !== "string") { setMsg(t.error); setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 30));
    const parsed = parseCloud(t, { scale: Number(scale) });
    if (!parsed.cloud) { setMsg(parsed.error ?? "Could not read the scan."); setBusy(false); return; }
    const c = yUp ? yUpToZUp(parsed.cloud) : parsed.cloud;
    setInfo(`${c.n.toLocaleString("en-US")} points read${parsed.cloud.decimated ? " (thinned to keep it fast)" : ""}${parsed.cloud.skipped ? `, ${parsed.cloud.skipped} unreadable line(s) skipped` : ""}.`);
    setDet(detectRooms(c, { cell, closeGap: gap }));
    setBusy(false);
  };
  const create = () => {
    if (!det) return;
    const r = projectFromFloors(`${project.name} (scan)`, [{ name: "Scanned floor", height: null, rooms: det.rooms.map((q, i) => ({ name: `Room ${i + 1}`, type: "", ...q })) }]);
    if ("error" in r) { setMsg(r.error); return; }
    saveProject(r.project); setCreated(r.project.id);
  };
  return (
    <div className="space-y-4">
      <Card title="Scan to plan (point cloud)">
        <PrelimBanner>Reads a point cloud you already have (ASCII XYZ, CSV or ASCII PLY, from a scanner or a photogrammetry/LiDAR app) and finds rectangular rooms. Capturing the scan itself needs a scanner or phone app and is not included here. The result is a starting point to check against measurements: curved or angled walls, heavy clutter and incomplete scans reduce accuracy. It runs in your browser and the file is not uploaded anywhere.</PrelimBanner>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Sel label="Scan units" value={scale} options={[["1", "Metres"], ["0.001", "Millimetres"], ["0.01", "Centimetres"], ["0.3048", "Feet"]]} onChange={setScale} />
          <Num label="Cell size (m)" value={cell} onChange={(v) => v && v >= 0.02 && setCell(v)} />
          <Num label="Close gaps up to (m), for doors" value={gap} onChange={(v) => v != null && setGap(v)} />
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={yUp} onChange={(e) => setYUp(e.target.checked)} /> Scan is Y-up</label>
        </div>
        <label className="mt-3 block text-sm">Choose a scan file (.xyz, .pts, .csv, .txt, .ply)<input type="file" accept=".xyz,.pts,.csv,.txt,.ply" className={inputCls} onChange={(e) => void run(e.target.files?.[0])} /></label>
        {busy && <p role="status" className="mt-2 text-sm">Working…</p>}
        {msg && <p role="alert" className="mt-2 text-sm text-red-700">{msg}</p>}
        {info && <p className="mt-2 text-sm text-ink-600">{info}</p>}
      </Card>
      {det && (
        <Card title="Detected rooms">
          <p className="text-sm">{det.rooms.length} room(s) found; floor level {det.floorZ} m; {det.slicePoints.toLocaleString("en-US")} wall-height points used.</p>
          {det.warnings.map((w, i) => <p key={i} className="text-sm text-amber-800">{w}</p>)}
          {det.rooms.length > 0 && (<><div className="mt-3"><SvgView svg={roomsSvg(det)} label="Detected rooms" /></div><div className="mt-3 flex flex-wrap gap-2"><SvgDownloads svg={roomsSvg(det)} base="scan-rooms" /><button className={btnPrimary} onClick={create}>Create a new project from these rooms</button></div></>)}
          {created && <NewProjectLink id={created} />}
        </Card>
      )}
    </div>
  );
}

const SUPPORTS: Array<[Support, string]> = [["simple", "Simply supported"], ["fixed", "Fixed both ends"], ["propped", "Fixed one end, propped other"], ["cantilever", "Cantilever"]];
export function StructuralPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const def = useMemo(() => defaultSections(project), [project]);
  const [s, setS] = useStored(project.id, "struct", { ...def, beamUdl: 0, elasticGPa: 25, densityKnM3: 25, poisson: 0.17 });
  const [b, setB] = useStored<BeamInput>(project.id, "beam", { spanM: 4, udlKnM: 0, pointKn: 0, support: "simple", bM: def.beamB, dM: def.beamD, elasticGPa: 25, limitRatio: 250 });
  const frame = useMemo(() => buildFrame(project), [project]);
  const res = useMemo(() => analyzeBeam(b), [b]);
  const spans = useMemo(() => project.floors.flatMap((f) => buildStructure(f, project.detail?.maxSpan ?? 4.5).beams.map((m) => Math.hypot(m.x2 - m.x1, m.y2 - m.y1))).sort((x, y) => y - x), [project]);
  const name = safeFileName(project.name);
  return (
    <div className="space-y-4">
      <Card title="Structural analysis hand-off">
        <PrelimBanner>Writes the app&apos;s indicative column-and-beam layout as a simple frame for a structural engineer to open in their own analysis software. The layout is not engineered, and sections and loads are values you enter. The STAAD text follows the standard command layout but was not opened in STAAD here; ETABS and SAP2000 can use the CSV by manual mapping only. A licensed structural engineer must design and check the real structure.</PrelimBanner>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Nodes" value={String(frame.nodes.length)} /><Stat label="Columns" value={String(frame.members.filter((m) => m.kind === "column").length)} /><Stat label="Beams" value={String(frame.members.filter((m) => m.kind === "beam").length)} /><Stat label="Supports (ground)" value={String(frame.nodes.filter((n) => n.support).length)} /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Column width (m)" value={s.colB} onChange={(v) => v && setS({ ...s, colB: v })} /><Num label="Column depth (m)" value={s.colD} onChange={(v) => v && setS({ ...s, colD: v })} />
          <Num label="Beam width (m)" value={s.beamB} onChange={(v) => v && setS({ ...s, beamB: v })} /><Num label="Beam depth (m)" value={s.beamD} onChange={(v) => v && setS({ ...s, beamD: v })} />
          <Num label="Load on beams (kN/m), yours" value={s.beamUdl} onChange={(v) => setS({ ...s, beamUdl: v ?? 0 })} /><Num label="Concrete modulus E (GPa), yours" value={s.elasticGPa} onChange={(v) => v && setS({ ...s, elasticGPa: v })} />
          <Num label="Concrete weight (kN/m³)" value={s.densityKnM3} onChange={(v) => v && setS({ ...s, densityKnM3: v })} /><Num label="Poisson ratio" value={s.poisson} onChange={(v) => v != null && v < 0.5 && setS({ ...s, poisson: v })} />
        </div>
        {frame.members.length === 0 ? <p className="mt-3 text-sm text-ink-600">Draw rooms and walls first; the frame comes from them.</p> : (
          <div className="mt-3 flex flex-wrap gap-2"><button className={btnPrimary} onClick={() => downloadText(staadText(project, frame, s, s), `${name}.std`, "text/plain")}>Download STAAD input (.std)</button><button className={btn} onClick={() => downloadText(frameCsv(frame, s), `${name}-frame.csv`, "text/csv")}>Download frame (CSV)</button></div>
        )}
      </Card>
      <Card title="Single beam hand-check">
        <PrelimBanner>Textbook formulas for one beam with a full-length uniform load (and a central point load for simply supported or fixed beams). Uncracked, elastic. It is not a reinforced-concrete design: no cracking, creep, reinforcement, shear design, continuity or load combinations.</PrelimBanner>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Span (m)" value={b.spanM} onChange={(v) => v && setB({ ...b, spanM: v })} /><Sel label="Supports" value={b.support} options={SUPPORTS} onChange={(v) => setB({ ...b, support: v })} />
          <Num label="Uniform load (kN/m)" value={b.udlKnM} onChange={(v) => setB({ ...b, udlKnM: v ?? 0 })} /><Num label="Central point load (kN)" value={b.pointKn} onChange={(v) => setB({ ...b, pointKn: v ?? 0 })} />
          <Num label="Width b (m)" value={b.bM} onChange={(v) => v && setB({ ...b, bM: v })} /><Num label="Depth d (m)" value={b.dM} onChange={(v) => v && setB({ ...b, dM: v })} />
          <Num label="E (GPa)" value={b.elasticGPa} onChange={(v) => v && setB({ ...b, elasticGPa: v })} /><Num label="Deflection limit: span / …" value={b.limitRatio} onChange={(v) => v && setB({ ...b, limitRatio: v })} />
        </div>
        {spans.length > 0 && <p className="mt-2 text-xs text-ink-600">Longest beam spans in your layout: {spans.slice(0, 5).map((x) => x.toFixed(2)).join(", ")} m. <button className={btn} onClick={() => setB({ ...b, spanM: Math.round(spans[0] * 100) / 100 })}>Use the longest</button></p>}
        {"error" in res ? <p role="alert" className="mt-3 text-sm text-red-700">{res.error}</p> : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Max bending moment" value={`${res.maxMomentKnM.toFixed(1)} kN·m`} /><Stat label="Max shear" value={`${res.maxShearKn.toFixed(1)} kN`} /><Stat label="Deflection" value={`${res.deflectionMm.toFixed(1)} mm`} tone={res.deflectionOk ? "good" : "bad"} /><Stat label="Limit" value={`${res.limitMm.toFixed(1)} mm`} /></div>
            <p className="mt-2 text-sm">Uncracked bending stress {res.elasticStressMPa.toFixed(1)} MPa. {res.deflectionOk ? "Within" : "Over"} the deflection limit you entered. {res.notes.join(" ")}</p>
          </>
        )}
      </Card>
    </div>
  );
}
