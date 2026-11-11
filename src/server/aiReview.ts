import type { Ctx } from "./auth";
import type { UserRow } from "./repo";
import { AiError, callProvider } from "./aiClient";
import { aiPublicStatus, loadAiConfig, takeQuota } from "./ai";
import { providerById } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/plan";
import { parseReview, reviewPrompts, type AiReview } from "@/lib/ai/review";
import { parseProject } from "@/lib/model/schema";

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

export async function runAiReview(ctx: Ctx, user: UserRow, raw: unknown): Promise<({ ok: true; provider: string; model: string } & AiReview) | Fail> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const status = await aiPublicStatus(ctx);
  if (!status.enabled) return fail(503, "AI mode is not switched on. Ask the owner to connect an AI service in Settings.");
  const cfg = await loadAiConfig(ctx);
  const pid = typeof r.provider === "string" && cfg.providers[r.provider] ? r.provider : cfg.defaultProvider;
  const pc = cfg.providers[pid];
  const info = providerById(pid);
  if (!pc || !info) return fail(400, "That AI service is not connected.");
  const parsed = parseProject(r.project);
  if (!parsed.ok) return fail(400, "The project data is not valid.");
  const findings = Array.isArray(r.findings) ? r.findings.filter((x): x is string => typeof x === "string").slice(0, 15) : [];
  if (!(await takeQuota(ctx, user, cfg.dailyLimit))) return fail(429, `You have used today's limit of ${cfg.dailyLimit} AI requests. It resets tomorrow, or the owner can raise it in Settings.`);
  const { system, user: prompt } = reviewPrompts(parsed.project, findings);
  try {
    const text = await callProvider(pid, pc.key, pc.model, system, [{ role: "user", content: prompt }], true, 45_000);
    const out = parseReview(extractJson(text));
    if (!out) return fail(422, "The AI answer could not be read. Please try again.");
    return { ok: true, provider: info.label, model: pc.model, ...out };
  } catch (e) {
    return fail(e instanceof AiError ? e.status : 502, e instanceof Error ? e.message : "The AI service failed.");
  }
}
