import type { Project } from "../model/types";
import { parseProject } from "../model/schema";

/**
 * A project bundle: the project plus the per-project settings and records kept in the browser (procurement, inspections, finance,
 * facility register, revisions, engineering inputs...) and the History snapshots. Used for file backups and server backups.
 */
export interface Bundle {
  app: "buildvision-ai";
  kind: "project-bundle";
  version: 1;
  createdAt: string;
  project: unknown;
  /** name -> JSON text, as saved under bv_an_<projectId>_<name> */
  stored: Record<string, string>;
  /** raw JSON text of the History snapshots array */
  history?: string;
}
export const MAX_BUNDLE_CHARS = 3_500_000;
const NAME = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_STORED_ITEM = 700_000;

export function buildBundle(project: Project, stored: Record<string, string>, history: string | null, now = new Date()): Bundle {
  return { app: "buildvision-ai", kind: "project-bundle", version: 1, createdAt: now.toISOString(), project, stored, ...(history ? { history } : {}) };
}

const validJson = (s: unknown): s is string => { if (typeof s !== "string") return false; try { JSON.parse(s); return true; } catch { return false; } };

export type ParsedBundle = { ok: true; bundle: Bundle; project: Project } | { ok: false; error: string };
export function parseBundle(text: string, maxChars = 50_000_000): ParsedBundle {
  if (typeof text !== "string" || text.length > maxChars) return { ok: false, error: "The backup is too large." };
  let b: unknown;
  try { b = JSON.parse(text); } catch { return { ok: false, error: "That is not a valid backup file." }; }
  const o = b as Partial<Bundle> | null;
  if (!o || o.app !== "buildvision-ai" || o.kind !== "project-bundle" || o.version !== 1) return { ok: false, error: "That is not a BuildVision AI project backup." };
  const pr = parseProject(o.project);
  if (!pr.ok) return { ok: false, error: "The project inside the backup is not valid: " + pr.errors[0] };
  const stored: Record<string, string> = {};
  const entries = Object.entries(o.stored ?? {});
  if (entries.length > 80) return { ok: false, error: "The backup has too many settings." };
  for (const [k, v] of entries) {
    if (!NAME.test(k) || !validJson(v) || v.length > MAX_STORED_ITEM) return { ok: false, error: `The backup has an invalid entry "${k.slice(0, 20)}".` };
    stored[k] = v;
  }
  if (o.history != null && (!validJson(o.history) || !Array.isArray(JSON.parse(o.history)) || o.history.length > 10_000_000)) return { ok: false, error: "The backup's history is not valid." };
  return { ok: true, bundle: { app: "buildvision-ai", kind: "project-bundle", version: 1, createdAt: typeof o.createdAt === "string" ? o.createdAt : "", project: o.project, stored, ...(o.history ? { history: o.history } : {}) }, project: pr.project };
}

/** The bundle re-keyed to a new project id, so restoring never overwrites an existing project. */
export function restorePlan(bundle: Bundle, project: Project, newId: string): { project: Project; stored: Record<string, string>; history: string | null } {
  let history: string | null = null;
  if (bundle.history) {
    const arr = JSON.parse(bundle.history) as Array<{ project?: { id?: string } }>;
    history = JSON.stringify(arr.map((s) => (s && s.project && typeof s.project === "object" ? { ...s, project: { ...s.project, id: newId } } : s)));
  }
  return { project: { ...project, id: newId, name: `${project.name} (restored)`.slice(0, 120) }, stored: { ...bundle.stored }, history };
}

/** Browser side: gather everything saved for one project. */
export function collectLocal(projectId: string): { stored: Record<string, string>; history: string | null } {
  const stored: Record<string, string> = {};
  let history: string | null = null;
  try {
    const ls = window.localStorage, prefix = `bv_an_${projectId}_`;
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(prefix)) { const v = ls.getItem(k); if (v != null) stored[k.slice(prefix.length)] = v; } }
    history = ls.getItem(`bv_history_${projectId}`);
  } catch { /* storage blocked */ }
  return { stored, history };
}
/** Browser side: write restored settings under a project id. Returns false if storage refused (full or blocked). */
export function writeLocal(projectId: string, stored: Record<string, string>, history: string | null): boolean {
  try {
    const ls = window.localStorage;
    for (const [k, v] of Object.entries(stored)) ls.setItem(`bv_an_${projectId}_${k}`, v);
    if (history) ls.setItem(`bv_history_${projectId}`, history);
    return true;
  } catch { return false; }
}
