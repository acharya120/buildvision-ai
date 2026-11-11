"use client";

import { useEffect, useMemo, useState } from "react";
import { addSnapshot, compareProjects, deleteSnapshot, loadSnapshots, metaOf, snapshotProject, type Snapshot } from "@/lib/history/history";
import { duplicateProject, isPersistent, saveProject } from "@/lib/storage/local";
import { formatArea } from "@/lib/model/units";
import { useWorkspace } from "@/lib/state/store";
import { btn, btnDanger, btnPrimary, inputCls } from "../ui/Field";
import { Card } from "./shared";

const NAMES: Record<string, string> = { floors: "Floors", rooms: "Rooms", area: "Room area (m²)", doors: "Doors", windows: "Windows" };

export default function HistoryTab() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [list, setList] = useState<Snapshot[]>([]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setList(loadSnapshots(project.id)), [project.id]);
  const metas = useMemo(() => list.map(metaOf).reverse(), [list]);

  const save = () => {
    const r = addSnapshot(project, label || `Version ${list.length + 1}`, note);
    setList(r.snapshots);
    if (!r.ok) return ws.notify("The browser has no room left to keep this version. Delete old versions or download a backup in the Export tab.", "error");
    setLabel("");
    setNote("");
    ws.notify("Version saved.");
  };
  const restore = (id: string) => {
    const s = list.find((x) => x.id === id);
    if (!s) return;
    const r = snapshotProject(s);
    if (!r.ok) return ws.notify(`That version cannot be opened: ${r.error}`, "error");
    setList(addSnapshot(project, "Before restore", `Automatic copy taken before restoring "${s.label}"`, true).snapshots);
    ws.commit({ ...r.project, id: project.id, updatedAt: new Date().toISOString() });
    ws.notify(`Restored "${s.label}". Use Undo to go back.`);
  };
  const dup = () => {
    if (!isPersistent()) return ws.notify("This browser is not saving projects, so a copy cannot be made. Download a backup instead.", "error");
    saveProject(project);
    const c = duplicateProject(project.id);
    ws.notify(c ? `Copy created: "${c.name}". Find it on your project list.` : "Could not create a copy.", c ? "info" : "error");
  };
  const diffs = (id: string) => {
    const s = list.find((x) => x.id === id);
    const r = s ? snapshotProject(s) : null;
    return r && r.ok ? compareProjects(r.project, project) : null;
  };

  return (
    <div className="space-y-4">
      <Card title="Save a version" right={<button className={btn} onClick={dup}>Duplicate this project</button>}>
        <p className="mb-3 text-xs text-ink-600">A version is a full copy of the design right now. Restoring one never loses your current work: a copy is taken first, and Undo also works.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input className={inputCls} placeholder="Name (e.g. Option B)" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Version name" />
          <input className={inputCls} placeholder="Note (optional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Version note" />
          <button className={btnPrimary} onClick={save}>Save version</button>
        </div>
      </Card>
      <Card title={`Design history (${metas.length})`}>
        {metas.length === 0 && <p className="text-sm text-ink-600">No versions yet. Save one before trying something big.</p>}
        <ul className="space-y-2">
          {metas.map((m) => (
            <li key={m.id} className="rounded-lg border border-ink-100 p-2.5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong>{m.label}</strong> {m.auto && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">automatic</span>}
                  <div className="text-xs text-ink-500">{new Date(m.at).toLocaleString()} · {m.floors} floor(s), {m.rooms} rooms, {formatArea(m.area, project.unitSystem)}</div>
                  {m.note && <div className="text-xs text-ink-700">{m.note}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? "Hide changes" : "Compare"}</button>
                  <button className={btn} onClick={() => restore(m.id)}>Restore</button>
                  <button className={btnDanger} onClick={() => setList(deleteSnapshot(project.id, m.id))}>Delete</button>
                </div>
              </div>
              {open === m.id && (
                <div className="mt-2 text-xs text-ink-700">
                  {(() => {
                    const d = diffs(m.id);
                    if (!d) return "This version cannot be compared.";
                    if (!d.length) return "No difference in floors, rooms, area, doors or windows compared with now.";
                    return <ul>{d.map((x) => <li key={x.field}>{NAMES[x.field] ?? x.field}: {Math.round(x.before * 100) / 100} then, {Math.round(x.after * 100) / 100} now</li>)}</ul>;
                  })()}
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-500">Versions are kept in this browser (up to 20 per project). They are not synced to other devices; use the backup in the Export tab to move a design.</p>
      </Card>
    </div>
  );
}
