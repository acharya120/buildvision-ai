import type { Project } from "../model/types";
import { parseProject } from "../model/schema";
import { clearLocalProjects, listProjects, loadProject, saveProject } from "../storage/local";
import { cloudHooks } from "../storage/cloudHooks";
import { api } from "./api";

const OWNER_KEY = "buildvision.owner.v1";
const KV_STORAGE: Record<"roomLibrary" | "ratePresets", string> = { roomLibrary: "buildvision.roomLibrary.v1", ratePresets: "buildvision.ratePresets.v1" };
const DELAY = 1200;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const latest = new Map<string, Project>();
let failed = 0;

function push(p: Project): Promise<boolean> {
  return api("/api/projects", "POST", { project: p }).then((r) => {
    if (!r.ok) failed++;
    return r.ok;
  });
}

function startHooks(): void {
  cloudHooks.saveProject = (p) => {
    latest.set(p.id, p);
    const t = pending.get(p.id);
    if (t) clearTimeout(t);
    pending.set(
      p.id,
      setTimeout(() => {
        pending.delete(p.id);
        const l = latest.get(p.id);
        latest.delete(p.id);
        if (l) void push(l);
      }, DELAY),
    );
  };
  cloudHooks.deleteProject = (id) => {
    const t = pending.get(id);
    if (t) clearTimeout(t);
    pending.delete(id);
    latest.delete(id);
    void api(`/api/projects?id=${encodeURIComponent(id)}`, "DELETE");
  };
  cloudHooks.kv = (key, value) => void api("/api/kv", "PUT", { key, value });
}

/** Sends any edit that is still waiting, so nothing is lost when logging out or closing. */
export async function flushCloud(): Promise<boolean> {
  const jobs: Promise<boolean>[] = [];
  for (const [id, t] of pending) {
    clearTimeout(t);
    const l = latest.get(id);
    if (l) jobs.push(push(l));
  }
  pending.clear();
  latest.clear();
  await Promise.all(jobs);
  return failed === 0;
}

/** Runs once after login: switches sync on and merges this browser with the account (newer edit wins). */
export async function startCloud(userId: string): Promise<{ ok: boolean; error?: string }> {
  failed = 0;
  try {
    const owner = window.localStorage.getItem(OWNER_KEY);
    if (owner && owner !== userId) {
      // another person used this browser: their local copies must never mix into this account
      clearLocalProjects();
      for (const k of Object.values(KV_STORAGE)) window.localStorage.removeItem(k);
    }
    window.localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* storage blocked: sync still works from memory */
  }
  const res = await api<{ projects?: Array<{ id: string; data: string; updatedAt: string }> }>("/api/projects");
  if (!res.ok) return { ok: false, error: res.data.error ?? "Could not load your saved projects." };
  const cloud = new Map<string, { updatedAt: string; project: Project }>();
  for (const row of res.data.projects ?? []) {
    try {
      const parsed = parseProject(JSON.parse(row.data));
      if (parsed.ok) cloud.set(row.id, { updatedAt: row.updatedAt, project: parsed.project });
    } catch {
      /* skip a damaged copy */
    }
  }
  for (const [id, c] of cloud) {
    const local = loadProject(id);
    if (!local || c.updatedAt > local.updatedAt) saveProject(c.project, { skipCloud: true });
  }
  const uploads: Promise<boolean>[] = [];
  for (const local of listProjects()) {
    const c = cloud.get(local.id);
    if (!c || local.updatedAt > c.updatedAt) uploads.push(push(local));
  }
  await Promise.all(uploads);
  for (const key of ["roomLibrary", "ratePresets"] as const) {
    const r = await api<{ value?: string | null }>(`/api/kv?key=${key}`);
    try {
      if (r.ok && typeof r.data.value === "string") window.localStorage.setItem(KV_STORAGE[key], r.data.value);
      else {
        const mine = window.localStorage.getItem(KV_STORAGE[key]);
        if (r.ok && mine) void api("/api/kv", "PUT", { key, value: mine });
      }
    } catch {
      /* ignore */
    }
  }
  startHooks();
  return { ok: true };
}

/** Logout: send pending edits, stop syncing, and clear this browser's copies (they stay in the account). */
export async function stopCloud(): Promise<void> {
  await flushCloud();
  cloudHooks.saveProject = undefined;
  cloudHooks.deleteProject = undefined;
  cloudHooks.kv = undefined;
  if (failed === 0) {
    clearLocalProjects();
    try {
      for (const k of Object.values(KV_STORAGE)) window.localStorage.removeItem(k);
      window.localStorage.removeItem(OWNER_KEY);
    } catch {
      /* ignore */
    }
  }
}
