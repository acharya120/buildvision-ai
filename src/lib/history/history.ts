import type { Project } from "../model/types";
import { parseProject } from "../model/schema";
import { isValidRect } from "../geometry/rect";

export interface Snapshot {
  id: string;
  at: string;
  label: string;
  note: string;
  /** true for snapshots the app made itself before a risky action */
  auto: boolean;
  project: unknown;
}
export interface SnapshotMeta { id: string; at: string; label: string; note: string; auto: boolean; rooms: number; floors: number; area: number }

const KEY = (projectId: string) => `bv_history_${projectId}`;
export const MAX_SNAPSHOTS = 20;

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadSnapshots(projectId: string): Snapshot[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY(projectId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === "string" && typeof x.at === "string" && x.project) : [];
  } catch {
    return [];
  }
}

/** Drop the oldest automatic snapshots first, then the oldest named ones. */
export function trimSnapshots(list: Snapshot[], max = MAX_SNAPSHOTS): Snapshot[] {
  const out = [...list];
  while (out.length > max) {
    const i = out.findIndex((x) => x.auto);
    out.splice(i >= 0 ? i : 0, 1);
  }
  return out;
}

function write(projectId: string, list: Snapshot[]): boolean {
  const s = store();
  if (!s) return false;
  let cur = list;
  for (;;) {
    try {
      s.setItem(KEY(projectId), JSON.stringify(cur));
      return true;
    } catch {
      if (cur.length <= 1) return false;
      cur = cur.slice(1); // storage full: forget the oldest
    }
  }
}

export function addSnapshot(p: Project, label: string, note = "", auto = false): { ok: boolean; snapshots: Snapshot[] } {
  const prev = loadSnapshots(p.id);
  const snap: Snapshot = { id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), label: label.trim().slice(0, 60) || "Snapshot", note: note.trim().slice(0, 300), auto, project: JSON.parse(JSON.stringify(p)) };
  const next = trimSnapshots([...prev, snap]);
  const ok = write(p.id, next);
  return { ok, snapshots: ok ? loadSnapshots(p.id) : prev };
}

export function deleteSnapshot(projectId: string, id: string): Snapshot[] {
  const next = loadSnapshots(projectId).filter((s) => s.id !== id);
  write(projectId, next);
  return next;
}
export function clearSnapshots(projectId: string): void {
  try {
    store()?.removeItem(KEY(projectId));
  } catch {
    /* ignore */
  }
}

/** Re-validate a stored snapshot before it is used. */
export function snapshotProject(s: Snapshot): { ok: true; project: Project } | { ok: false; error: string } {
  const r = parseProject(s.project);
  return r.ok ? { ok: true, project: r.project } : { ok: false, error: r.errors[0] ?? "Snapshot is damaged." };
}

export function summarize(p: Project) {
  const rooms = p.floors.flatMap((f) => f.rooms.filter(isValidRect));
  return { floors: p.floors.length, rooms: rooms.length, area: rooms.reduce((s, r) => s + r.width * r.depth, 0), doors: p.floors.reduce((s, f) => s + f.openings.filter((o) => o.kind === "door").length, 0), windows: p.floors.reduce((s, f) => s + f.openings.filter((o) => o.kind === "window").length, 0) };
}
export function metaOf(s: Snapshot): SnapshotMeta {
  const r = parseProject(s.project);
  const sum = r.ok ? summarize(r.project) : { floors: 0, rooms: 0, area: 0 };
  return { id: s.id, at: s.at, label: s.label, note: s.note, auto: s.auto, rooms: sum.rooms, floors: sum.floors, area: sum.area };
}

export interface Diff { field: string; before: number; after: number }
export function compareProjects(a: Project, b: Project): Diff[] {
  const x = summarize(a), y = summarize(b);
  return (Object.keys(x) as Array<keyof typeof x>).filter((k) => Math.abs(x[k] - y[k]) > 1e-6).map((k) => ({ field: k, before: x[k], after: y[k] }));
}
