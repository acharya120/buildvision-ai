import { providerById, type ProviderInfo } from "@/lib/ai/providers";

export interface ChatMsg { role: "user" | "assistant"; content: string }
export class AiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 45_000;

/** Never lets the key appear in an error message. */
function safe(text: string, key: string): string {
  return text.split(key).join("[key]").replace(/\s+/g, " ").trim().slice(0, 200);
}

function friendly(status: number, body: string, p: ProviderInfo, key: string): AiError {
  const detail = safe(body, key);
  if (status === 401 || status === 403) return new AiError(`${p.label} refused the key. Copy the key again from ${p.getKeyUrl} and check that billing or the free quota is active. (${detail})`, 400);
  if (status === 404) return new AiError(`${p.label} does not know that model name. Change the model in Settings. (${detail})`, 400);
  if (status === 429) return new AiError(`${p.label} says the limit or quota is used up. Check the plan and billing on their website, or try later. (${detail})`, 429);
  if (status === 400) return new AiError(`${p.label} rejected the request: ${detail}`, 400);
  return new AiError(`${p.label} had a problem (HTTP ${status}). ${detail}`, 502);
}

async function post(url: string, headers: Record<string, string>, body: unknown, p: ProviderInfo, key: string, timeoutMs: number): Promise<{ status: number; text: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal, cache: "no-store" });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new AiError(`${p.label} took too long to answer. Try again.`, 504);
    throw new AiError(`Could not reach ${p.label}. Try again in a moment.`, 502);
  } finally {
    clearTimeout(timer);
  }
}

const parse = (t: string): Record<string, unknown> => {
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** One call to the chosen AI service. Returns the text of its answer. */
export async function callProvider(providerId: string, key: string, model: string, system: string, messages: ChatMsg[], json = true, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const p = providerById(providerId);
  if (!p) throw new AiError("Unknown AI provider.", 400);
  if (p.kind === "anthropic") {
    const r = await post(`${p.baseUrl}/messages`, { "x-api-key": key, "anthropic-version": "2023-06-01" }, { model, max_tokens: 8000, system, messages }, p, key, timeoutMs);
    if (r.status !== 200) throw friendly(r.status, r.text, p, key);
    const c = (parse(r.text).content as Array<{ type?: string; text?: string }> | undefined) ?? [];
    return c.filter((x) => x.type === "text").map((x) => x.text ?? "").join("");
  }
  if (p.kind === "gemini") {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { ...(json ? { responseMimeType: "application/json" } : {}), temperature: 0.4 },
    };
    const r = await post(`${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, body, p, key, timeoutMs);
    if (r.status !== 200) throw friendly(r.status, r.text, p, key);
    const parts = ((parse(r.text).candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]?.content?.parts) ?? [];
    return parts.map((x) => x.text ?? "").join("");
  }
  // OpenAI and every service that speaks the same format
  const base = { model, messages: [{ role: "system", content: system }, ...messages] };
  let r = await post(`${p.baseUrl}/chat/completions`, { authorization: `Bearer ${key}` }, json ? { ...base, response_format: { type: "json_object" } } : base, p, key, timeoutMs);
  if (r.status === 400 && json && /response_format|json/i.test(r.text)) r = await post(`${p.baseUrl}/chat/completions`, { authorization: `Bearer ${key}` }, base, p, key, timeoutMs);
  if (r.status !== 200) throw friendly(r.status, r.text, p, key);
  const ch = (parse(r.text).choices as Array<{ message?: { content?: string } }> | undefined) ?? [];
  return ch[0]?.message?.content ?? "";
}
