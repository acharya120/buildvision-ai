"use client";

import { useMemo, useState } from "react";
import { addSnapshot, loadSnapshots, snapshotProject } from "@/lib/history/history";
import { renovationDiff, renovationCost } from "@/lib/engineering/renovation";
import { issueRevision, revisionsCsv, changesSinceLast, type Revision } from "@/lib/engineering/revisions";
import { buildReport, reportHtml, reportCsv } from "@/lib/engineering/report";
import { renovationSvg } from "@/lib/engineering/sheets";
import { csvHeader } from "@/lib/engineering/prelim";
import { downloadText, safeFileName } from "@/lib/export/download";
import { useStored } from "@/lib/analysis/useStored";
import { setRate } from "@/lib/model/ops";
import { useWorkspace } from "@/lib/state/store";
import { btn, btnPrimary, inputCls, NumberField } from "../ui/Field";
import { Card, Chip, SvgDownloads, SvgView } from "../studio/shared";
import { Stat } from "../analysis/common";
import { Bars, PrelimBanner } from "./common";

const RATES: Array<[string, string]> = [["ren-demolish", "Demolition, per m³"], ["ren-debris", "Debris removal, per m³"], ["ren-wall", "New wall, per m³"], ["ren-opening", "Opening cut or fill, each"]];

export function RenovationPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [baseId, setBaseId] = useStored<string | null>(project.id, "renoBase", null);
  const [fi, setFi] = useState(0);
  const [msg, setMsg] = useState("");
  const base = useMemo(() => {
    if (!baseId) return null;
    const s = loadSnapshots(project.id).find((x) => x.id === baseId);
    if (!s) return null;
    const r = snapshotProject(s);
    return r.ok ? r.project : null;
  }, [baseId, project.id]);
  const diff = useMemo(() => (base ? renovationDiff(base, project) : null), [base, project]);
  const cost = useMemo(() => (diff ? renovationCost(diff, project.rates) : null), [diff, project.rates]);
  const idx = Math.min(fi, project.floors.length - 1);
  const svg = useMemo(() => (diff ? renovationSvg(project, diff, project.floors[idx].name) : ""), [diff, project, idx]);
  const save = () => {
    const r = addSnapshot(project, "Existing building baseline", "Used by the renovation planner");
    if (!r.ok) { setMsg("Could not save: browser storage is full or blocked."); return; }
    setBaseId(r.snapshots[r.snapshots.length - 1].id);
    setMsg("Baseline saved. Now edit the plan to show the renovation.");
  };
  return (
    <div className="space-y-4">
      <Card title="Renovation and remodeling planner">
        <PrelimBanner>Save the building as it exists now, then edit the plan. The planner compares the two: rooms added or removed, walls to demolish or build, and volumes. Quantities are geometric (length × height × thickness) and do not check which walls carry load, so a structural engineer must confirm before any wall is removed.</PrelimBanner>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={btnPrimary} onClick={save}>{base ? "Replace baseline with current plan" : "Save current plan as existing building"}</button>
          {base && <button className={btn} onClick={() => { setBaseId(null); setMsg(""); }}>Forget baseline</button>}
          {msg && <span role="status" className="text-sm text-ink-600">{msg}</span>}
        </div>
        {baseId && !base && <p className="mt-2 text-sm text-amber-800">The saved baseline is no longer in History (it may have been trimmed). Save a new one.</p>}
      </Card>
      {diff && cost && (
        <>
          <Card title="What changes">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Wall to demolish" value={`${diff.removedWallM.toFixed(1)} m`} /><Stat label="New wall" value={`${diff.addedWallM.toFixed(1)} m`} /><Stat label="Demolished volume" value={`${diff.demolishedM3.toFixed(1)} m³`} /><Stat label="New wall volume" value={`${diff.newM3.toFixed(1)} m³`} /></div>
            <div className="my-3 flex gap-1.5 overflow-x-auto">{project.floors.map((f, i) => <Chip key={f.id} active={i === idx} onClick={() => setFi(i)}>{f.name}</Chip>)}</div>
            <SvgView svg={svg} label="Renovation plan" />
            <div className="mt-3"><SvgDownloads svg={svg} base={`renovation-${idx + 1}`} /></div>
            <ul className="mt-3 space-y-1 text-sm">{diff.rooms.length === 0 && <li className="text-ink-600">No room changes yet.</li>}{diff.rooms.map((r) => <li key={r.roomId + r.kind}><strong>{r.kind === "new" ? "New" : r.kind === "demolished" ? "Remove" : "Modify"}:</strong> {r.name} ({r.floorName}) {r.detail}</li>)}</ul>
          </Card>
          <Card title="Renovation cost (your rates only)">
            <p className="mb-2 text-sm text-ink-600">Debris is bulked by 30%. Nothing is priced until you enter a rate, so no figure here is invented.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{RATES.map(([k, l]) => <NumberField key={k} label={l} value={project.rates[k] ?? null} onCommit={(v) => ws.commit(setRate(ws.getState().project, k, v))} />)}</div>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Item</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>{cost.lines.map((l) => <tr key={l.key} className="border-t border-ink-100"><td className="py-1">{l.name}</td><td>{l.qty.toFixed(1)} {l.unit}</td><td>{l.amount == null ? "enter a rate" : Math.round(l.amount).toLocaleString("en-US")}</td></tr>)}</tbody></table></div>
            <p className="mt-2 text-sm font-medium">Priced total: {Math.round(cost.total).toLocaleString("en-US")}{cost.unrated ? ` (${cost.unrated} item${cost.unrated > 1 ? "s" : ""} not priced)` : ""}</p>
          </Card>
        </>
      )}
    </div>
  );
}

export function RevisionsPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [revs, setRevs] = useStored<Revision[]>(project.id, "revisions", []);
  const [by, setBy] = useState("");
  const [desc, setDesc] = useState("");
  const [msg, setMsg] = useState("");
  const pending = useMemo(() => changesSinceLast(project, revs[revs.length - 1]), [project, revs]);
  const issue = () => {
    const r = issueRevision(project, revs, by, desc);
    setRevs([...revs, r.revision]);
    setDesc("");
    setMsg(r.stored ? `Revision ${r.revision.rev} issued and a snapshot saved in History.` : `Revision ${r.revision.rev} recorded, but the snapshot could not be saved (storage full).`);
  };
  return (
    <div className="space-y-4">
      <Card title="Drawing revision and change management">
        <PrelimBanner>A register of issued revisions (A, B, C…). Each issue saves a snapshot of the design and lists what changed since the previous issue. It is a record kept in this browser; it is not a controlled document system.</PrelimBanner>
        <div className="mt-3"><h4 className="text-xs font-semibold text-ink-700">Changes since {revs.length ? `rev ${revs[revs.length - 1].rev}` : "the start"}</h4><ul className="mt-1 list-disc pl-5 text-sm">{pending.length ? pending.map((c, i) => <li key={i}>{c}</li>) : <li className="list-none text-ink-600">No changes yet.</li>}</ul></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <label className="block text-sm">Issued by<input className={inputCls} value={by} maxLength={60} onChange={(e) => setBy(e.target.value)} /></label>
          <label className="block text-sm">Reason for issue<input className={inputCls} value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} /></label>
          <button className={`${btnPrimary} self-end`} onClick={issue}>Issue revision</button>
        </div>
        {msg && <p role="status" className="mt-2 text-sm text-ink-600">{msg}</p>}
      </Card>
      <Card title="Register" right={revs.length ? <button className={btn} onClick={() => downloadText(csvHeader("Drawing revision register") + revisionsCsv(project, revs), `${safeFileName(project.name)}-revisions.csv`, "text/csv")}>Download CSV</button> : undefined}>
        {revs.length === 0 ? <p className="text-sm text-ink-600">No revisions issued yet.</p> : (
          <ol className="space-y-2 text-sm">{[...revs].reverse().map((r) => <li key={r.rev} className="rounded-lg border border-ink-200 p-2"><strong>Rev {r.rev}</strong> · {r.date}{r.by ? ` · ${r.by}` : ""}<div>{r.description}</div>{r.changes.length > 0 && <div className="text-xs text-ink-600">{r.changes.join("; ")}</div>}</li>)}</ol>
        )}
      </Card>
    </div>
  );
}

export function ReportsPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [tick, setTick] = useState(0);
  const rep = useMemo(() => buildReport(project), [project, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = safeFileName(project.name);
  return (
    <div className="space-y-4">
      <Card title="Project report and analytics" right={<div className="flex flex-wrap gap-2"><button className={btn} onClick={() => setTick(tick + 1)}>Refresh</button><button className={btn} onClick={() => downloadText(reportHtml(rep), `${name}-report.html`, "text/html")}>Report (HTML)</button><button className={btn} onClick={() => downloadText(reportCsv(rep), `${name}-report.csv`, "text/csv")}>Data (CSV)</button></div>}>
        <PrelimBanner>Collects the figures from your design and from the Engineering pages you have filled in (it reads their saved values). Open the HTML report in a browser and use Print to save a PDF.</PrelimBanner>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Bars title="Area by room type (m²)" data={rep.charts.areaByType} />
          <Bars title="Cost by group" data={rep.charts.costByGroup} />
          <Bars title="Embodied carbon by material (kg)" data={rep.charts.carbonByMaterial} />
          <Bars title="Design check results" data={rep.charts.issues} />
        </div>
      </Card>
      {rep.sections.map((s) => (
        <Card key={s.title} title={s.title}>
          {s.note && <p className="mb-2 text-xs text-ink-600">{s.note}</p>}
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{s.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-ink-100 py-1"><dt className="text-ink-600">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>
        </Card>
      ))}
    </div>
  );
}
