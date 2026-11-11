import type { Project } from "../model/types";
import { addSnapshot, loadSnapshots, snapshotProject } from "../history/history";
import { renovationDiff, type RenovationDiff } from "./renovation";
import { csvHeader } from "./prelim";

export interface Revision { rev: string; date: string; by: string; description: string; changes: string[]; snapshotId: string | null }

/** A, B ... Z, AA, AB ... */
export function revLetter(i: number): string {
  let s = "", n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

export function summariseChanges(d: RenovationDiff): string[] {
  const out: string[] = [];
  for (const r of d.rooms) out.push(`${r.floorName}: ${r.name} - ${r.kind === "new" ? "added" : r.kind === "demolished" ? "removed" : "changed"} (${r.detail})`);
  if (d.addedWallM > 0.05) out.push(`Walls added: ${d.addedWallM.toFixed(1)} m`);
  if (d.removedWallM > 0.05) out.push(`Walls removed: ${d.removedWallM.toFixed(1)} m`);
  if (d.openingsAdded) out.push(`Openings added: ${d.openingsAdded}`);
  if (d.openingsRemoved) out.push(`Openings removed: ${d.openingsRemoved}`);
  return out;
}

/** Changes since the snapshot kept for the last issued revision (or since nothing, for the first issue). */
export function changesSinceLast(p: Project, last: Revision | undefined): string[] {
  if (!last?.snapshotId) return ["First issue."];
  const s = loadSnapshots(p.id).find((x) => x.id === last.snapshotId);
  const r = s ? snapshotProject(s) : null;
  if (!r || !r.ok) return ["Previous issue snapshot is no longer available; changes cannot be listed automatically."];
  const c = summariseChanges(renovationDiff(r.project, p));
  return c.length ? c : ["No change to rooms, walls or openings since the last issue."];
}

/** Issue the next revision: saves a snapshot of the design as issued and records what changed. */
export function issueRevision(p: Project, existing: Revision[], by: string, description: string): { revision: Revision; stored: boolean } {
  const rev = revLetter(existing.length);
  const changes = changesSinceLast(p, existing[existing.length - 1]);
  const snap = addSnapshot(p, `Issued rev ${rev}`, description.slice(0, 200), false);
  const id = snap.ok ? snap.snapshots[snap.snapshots.length - 1]?.id ?? null : null;
  return { revision: { rev, date: new Date().toISOString().slice(0, 10), by: by.trim().slice(0, 60), description: description.trim().slice(0, 300) || "Issued", changes, snapshotId: id }, stored: snap.ok };
}

export function revisionsCsv(p: Project, revs: Revision[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return csvHeader(`Drawing revision register - ${p.name}`) + ["Rev,Date,By,Description,Changes", ...revs.map((r) => [r.rev, r.date, q(r.by), q(r.description), q(r.changes.join("; "))].join(","))].join("\n");
}
