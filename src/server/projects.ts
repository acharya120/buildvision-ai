import { parseProject } from "@/lib/model/schema";
import type { Ctx } from "./auth";
import type { ProjectRow } from "./repo";

export const MAX_PROJECT_BYTES = 2_000_000;
export const KV_KEYS = ["roomLibrary", "ratePresets"] as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Fail = { ok: false; status: number; error: string };

export async function listCloudProjects(ctx: Ctx, userId: string): Promise<ProjectRow[]> {
  return ctx.repo.listProjects(userId);
}

/** The project is checked with the same validator as file imports before it is stored. */
export async function saveCloudProject(ctx: Ctx, userId: string, raw: unknown): Promise<{ ok: true } | Fail> {
  const project = (raw as { project?: unknown } | null)?.project;
  const parsed = parseProject(project);
  if (!parsed.ok) return { ok: false, status: 400, error: "That project is not valid: " + parsed.errors[0] };
  const p = parsed.project;
  if (!ID.test(p.id)) return { ok: false, status: 400, error: "Invalid project id." };
  const data = JSON.stringify(p);
  if (data.length > MAX_PROJECT_BYTES) return { ok: false, status: 413, error: "The project is too large to store (2 MB limit)." };
  await ctx.repo.upsertProject(userId, { id: p.id, name: p.name.slice(0, 120), data, updatedAt: p.updatedAt });
  return { ok: true };
}

export async function deleteCloudProject(ctx: Ctx, userId: string, id: string): Promise<{ ok: true } | Fail> {
  if (!ID.test(id)) return { ok: false, status: 400, error: "Invalid project id." };
  await ctx.repo.deleteProject(userId, id);
  return { ok: true };
}

export async function getKvValue(ctx: Ctx, userId: string, key: string): Promise<string | null> {
  return (KV_KEYS as readonly string[]).includes(key) ? ctx.repo.getKv(userId, key) : null;
}

export async function setKvValue(ctx: Ctx, userId: string, key: string, value: unknown): Promise<{ ok: true } | Fail> {
  if (!(KV_KEYS as readonly string[]).includes(key)) return { ok: false, status: 400, error: "Unknown key." };
  if (typeof value !== "string" || value.length > 200_000) return { ok: false, status: 400, error: "Invalid value." };
  try {
    JSON.parse(value);
  } catch {
    return { ok: false, status: 400, error: "Invalid value." };
  }
  await ctx.repo.setKv(userId, key, value);
  return { ok: true };
}
