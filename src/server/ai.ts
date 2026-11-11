import type { Ctx } from "./auth";
import type { UserRow } from "./repo";
import { decryptText, encryptText } from "./crypto";
import { AiError, callProvider, type ChatMsg } from "./aiClient";
import { PROVIDERS, apiKeyProblem, cleanApiKey, modelProblem, providerById } from "@/lib/ai/providers";
import { buildPrompts, extractJson, planToOption, sanitizeBrief, usableRect } from "@/lib/ai/plan";
import { isSimplePolygon, polygonBBox } from "@/lib/geometry/polygon";
import type { DesignOption } from "@/lib/layout/autodesign";
import type { Plot } from "@/lib/model/types";

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

interface StoredAi {
  enabled: boolean;
  defaultProvider: string;
  dailyLimit: number;
  providers: Record<string, { enc: string; model: string; last4: string }>;
}
export interface AiProviderConfig { id: string; key: string; model: string; last4: string; source: "database" | "environment" }
export interface AiConfig { enabled: boolean; defaultProvider: string; dailyLimit: number; providers: Record<string, AiProviderConfig> }

const ENV_KEYS: Record<string, keyof Ctx["env"]> = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };

async function readStored(ctx: Ctx): Promise<StoredAi> {
  const empty: StoredAi = { enabled: true, defaultProvider: "", dailyLimit: 20, providers: {} };
  try {
    const raw = await ctx.repo.getSetting("ai");
    if (!raw) return empty;
    const d = JSON.parse(raw) as Partial<StoredAi>;
    return {
      enabled: d.enabled !== false,
      defaultProvider: typeof d.defaultProvider === "string" ? d.defaultProvider : "",
      dailyLimit: Number.isInteger(d.dailyLimit) ? Math.min(500, Math.max(1, d.dailyLimit as number)) : 20,
      providers: d.providers && typeof d.providers === "object" ? d.providers : {},
    };
  } catch {
    return empty;
  }
}

export async function loadAiConfig(ctx: Ctx): Promise<AiConfig> {
  const st = await readStored(ctx);
  const providers: Record<string, AiProviderConfig> = {};
  for (const p of PROVIDERS) {
    const saved = st.providers[p.id];
    if (saved && ctx.env.APP_SECRET) {
      const key = decryptText(saved.enc, ctx.env.APP_SECRET);
      if (key) {
        providers[p.id] = { id: p.id, key, model: saved.model || p.defaultModel, last4: saved.last4, source: "database" };
        continue;
      }
    }
    const envName = ENV_KEYS[p.id];
    const envKey = envName ? cleanApiKey(ctx.env[envName]) : "";
    if (envKey && !apiKeyProblem(envKey)) providers[p.id] = { id: p.id, key: envKey, model: p.defaultModel, last4: envKey.slice(-4), source: "environment" };
  }
  const first = Object.keys(providers)[0] ?? "";
  return { enabled: st.enabled, defaultProvider: providers[st.defaultProvider] ? st.defaultProvider : first, dailyLimit: st.dailyLimit, providers };
}

/** What the admin sees: never the key, only whether it is connected and its last 4 characters. */
export async function aiOverview(ctx: Ctx) {
  const c = await loadAiConfig(ctx);
  return {
    enabled: c.enabled,
    defaultProvider: c.defaultProvider,
    dailyLimit: c.dailyLimit,
    providers: PROVIDERS.map((p) => {
      const cfg = c.providers[p.id];
      return { id: p.id, label: p.label, keyHint: p.keyHint, getKeyUrl: p.getKeyUrl, defaultModel: p.defaultModel, connected: !!cfg, model: cfg?.model ?? p.defaultModel, last4: cfg?.last4 ?? "", source: cfg?.source ?? null };
    }),
  };
}

async function writeStored(ctx: Ctx, mutate: (s: StoredAi) => void): Promise<void> {
  const st = await readStored(ctx);
  mutate(st);
  await ctx.repo.setSetting("ai", JSON.stringify(st));
}

/** Paste the key: it is tested with a tiny request first and is only saved when the provider accepts it. */
export async function connectProvider(ctx: Ctx, raw: unknown): Promise<{ ok: true; label: string; model: string } | Fail> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const info = typeof r.provider === "string" ? providerById(r.provider) : undefined;
  if (!info) return fail(400, "Choose one of the listed AI services.");
  if (!ctx.env.APP_SECRET) return fail(500, "APP_SECRET is not set on the server, so the key cannot be stored safely. Add it in Vercel (see the setup guide).");
  const model = typeof r.model === "string" && r.model.trim() ? r.model.trim() : info.defaultModel;
  const mp = modelProblem(model);
  if (mp) return fail(400, mp);
  let key = cleanApiKey(r.apiKey);
  if (!key) {
    const cur = await loadAiConfig(ctx);
    const have = cur.providers[info.id];
    if (!have) return fail(400, `Paste the ${info.label} key first.`);
    key = have.key;
  }
  const kp = apiKeyProblem(key);
  if (kp) return fail(400, kp);
  try {
    const out = await callProvider(info.id, key, model, "You are a connection test. Reply with the single word OK.", [{ role: "user", content: "Reply with OK." }], false);
    if (!out.trim()) return fail(400, `${info.label} accepted the key but returned an empty answer. Check the model name.`);
  } catch (e) {
    return fail(e instanceof AiError ? (e.status === 429 ? 429 : 400) : 500, e instanceof Error ? e.message : "The connection test failed.");
  }
  const enc = encryptText(key, ctx.env.APP_SECRET);
  await writeStored(ctx, (s) => {
    s.providers[info.id] = { enc, model, last4: key.slice(-4) };
    if (!s.defaultProvider) s.defaultProvider = info.id;
  });
  return { ok: true, label: info.label, model };
}

export async function disconnectProvider(ctx: Ctx, raw: unknown): Promise<{ ok: true } | Fail> {
  const id = raw && typeof raw === "object" ? (raw as Record<string, unknown>).provider : undefined;
  if (typeof id !== "string" || !providerById(id)) return fail(400, "Unknown AI service.");
  await writeStored(ctx, (s) => {
    delete s.providers[id];
    if (s.defaultProvider === id) s.defaultProvider = "";
  });
  return { ok: true };
}

export async function saveAiSettings(ctx: Ctx, raw: unknown): Promise<{ ok: true } | Fail> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const limit = Number(r.dailyLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return fail(400, "The daily limit must be a whole number from 1 to 500.");
  const def = typeof r.defaultProvider === "string" ? r.defaultProvider : "";
  if (def && !providerById(def)) return fail(400, "Unknown AI service.");
  await writeStored(ctx, (s) => {
    s.enabled = r.enabled !== false;
    s.dailyLimit = limit;
    if (def) s.defaultProvider = def;
  });
  return { ok: true };
}

/** For every logged-in user: is AI mode available, and which services can they pick. */
export async function aiPublicStatus(ctx: Ctx) {
  const c = await loadAiConfig(ctx);
  const list = PROVIDERS.filter((p) => c.providers[p.id]).map((p) => ({ id: p.id, label: p.label }));
  return { enabled: c.enabled && list.length > 0, providers: list, defaultProvider: c.defaultProvider, dailyLimit: c.dailyLimit };
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

export async function takeQuota(ctx: Ctx, user: UserRow, limit: number): Promise<boolean> {
  const day = today(ctx.now());
  const raw = await ctx.repo.getKv(user.id, "ai-usage");
  const [d, n] = (raw ?? "").split(":");
  const used = d === day ? Number(n) || 0 : 0;
  if (used >= limit) return false;
  await ctx.repo.setKv(user.id, "ai-usage", `${day}:${used + 1}`);
  return true;
}

function cleanPlot(raw: unknown): Plot | string {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const width = Number(r.width), depth = Number(r.depth);
  if (!(width >= 1.5 && width <= 5000 && depth >= 1.5 && depth <= 5000)) return "The plot size is not valid.";
  if (r.polygon === undefined) return { width, depth };
  const pts = Array.isArray(r.polygon) ? (r.polygon as Array<{ x?: unknown; y?: unknown }>) : [];
  if (pts.length < 3 || pts.length > 24 || pts.some((p) => typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "The plot outline is not valid.";
  const poly = pts.map((p) => ({ x: p.x as number, y: p.y as number }));
  const bb = polygonBBox(poly);
  if (bb.x0 < -0.01 || bb.y0 < -0.01 || bb.x1 > width + 0.01 || bb.y1 > depth + 0.01 || !isSimplePolygon(poly)) return "The plot outline is not valid.";
  return { width, depth, polygon: poly };
}

export interface AiDesignOk { ok: true; option: DesignOption; suggestions: string[]; provider: string; model: string; attempts: number }

/** Asks the chosen AI for a plan, checks it, and lets it repair its own mistakes (up to 3 tries in total). */
export async function runAiDesign(ctx: Ctx, user: UserRow, raw: unknown): Promise<AiDesignOk | Fail> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cfg = await loadAiConfig(ctx);
  const status = await aiPublicStatus(ctx);
  if (!status.enabled) return fail(503, "AI mode is not switched on. Ask the owner to connect an AI service in Settings.");
  const pid = typeof r.provider === "string" && cfg.providers[r.provider] ? r.provider : cfg.defaultProvider;
  const pc = cfg.providers[pid];
  const info = providerById(pid);
  if (!pc || !info) return fail(400, "That AI service is not connected.");
  const plot = cleanPlot(r.plot);
  if (typeof plot === "string") return fail(400, plot);
  const brief = sanitizeBrief(r.brief);
  const u = usableRect(plot, brief);
  if (typeof u === "string") return fail(400, u);
  if (!(await takeQuota(ctx, user, cfg.dailyLimit))) return fail(429, `You have used today's limit of ${cfg.dailyLimit} AI designs. It resets tomorrow, or the owner can raise it in Settings.`);

  const { system, user: prompt } = buildPrompts(plot, brief, u);
  const msgs: ChatMsg[] = [{ role: "user", content: prompt }];
  const started = Date.now();
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    let text: string;
    try {
      text = await callProvider(pid, pc.key, pc.model, system, msgs, true, Math.max(8_000, Math.min(45_000, 56_000 - (Date.now() - started))));
    } catch (e) {
      return fail(e instanceof AiError ? e.status : 502, e instanceof Error ? e.message : "The AI service failed.");
    }
    const data = extractJson(text);
    const res = data ? planToOption(brief, u, data) : { errors: ["The answer was not a single valid JSON object."] };
    if ("option" in res) {
      const option = { ...res.option, label: `AI design: ${res.title}`.slice(0, 90), notes: [...res.option.notes, `Created by ${info.label} (${pc.model}) from your form data${attempt > 1 ? `, after ${attempt - 1} automatic correction(s)` : ""}.`] };
      return { ok: true, option, suggestions: res.suggestions, provider: info.label, model: pc.model, attempts: attempt };
    }
    lastErrors = res.errors;
    if (Date.now() - started > 22_000) break; // a retry would not finish inside the 60 s function limit
    msgs.push({ role: "assistant", content: text.slice(0, 12_000) }, { role: "user", content: `That plan has problems. Fix ALL of them and return the complete corrected JSON object only:\n- ${res.errors.join("\n- ")}` });
  }
  return fail(422, `The AI did not produce a plan that passed the checks (${lastErrors.slice(0, 2).join(" ")}). Try again, try a different AI service, or use the rule-based generator below.`);
}
