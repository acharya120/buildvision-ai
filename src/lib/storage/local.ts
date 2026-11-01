import type { Project } from "../model/types";
import { parseProject } from "../model/schema";
import { newId } from "../model/ids";

const KEY = "buildvision.projects.v1";

/** In-memory fallback used when browser storage is blocked or full. */
let memory: Record<string, Project> = {};
let storageWorks: boolean | null = null;

function storage(): Storage | null {
  if (storageWorks === false) return null;
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__bv_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    storageWorks = true;
    return s;
  } catch {
    storageWorks = false;
    return null;
  }
}

export const isPersistent = () => storage() !== null;

function readAll(): Record<string, Project> {
  const s = storage();
  if (!s) return memory;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, Project> = {};
    for (const [id, value] of Object.entries(data)) {
      const parsed = parseProject(value);
      if (parsed.ok) out[id] = parsed.project; // corrupted entries are skipped, never loaded
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Project>): boolean {
  memory = all;
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false; // quota exceeded etc.
  }
}

export function listProjects(): Project[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadProject(id: string): Project | null {
  return readAll()[id] ?? null;
}

/** Returns false when the browser refused to store the data (the project is still kept in memory). */
export function saveProject(p: Project): boolean {
  const all = readAll();
  all[p.id] = p;
  return writeAll(all);
}

export function deleteProject(id: string): void {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

export function duplicateProject(id: string): Project | null {
  const src = loadProject(id);
  if (!src) return null;
  const now = new Date().toISOString();
  const copy: Project = { ...JSON.parse(JSON.stringify(src)), id: newId("proj"), name: `${src.name} (copy)`.slice(0, 80), createdAt: now, updatedAt: now };
  saveProject(copy);
  return copy;
}
