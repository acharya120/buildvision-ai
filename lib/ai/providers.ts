/** The AI services the owner can connect. Each has its own key box in the Settings panel. */
export type ProviderKind = "openai" | "anthropic" | "gemini";

export interface ProviderInfo {
  id: string;
  label: string;
  kind: ProviderKind;
  /** all requests go to this fixed address only */
  baseUrl: string;
  /** the owner can change the model in Settings; names change over time */
  defaultModel: string;
  keyHint: string;
  getKeyUrl: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "openai", label: "ChatGPT (OpenAI)", kind: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", keyHint: "starts with sk-", getKeyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultModel: "gemini-2.5-flash", keyHint: "starts with AIza", getKeyUrl: "https://aistudio.google.com/apikey" },
  { id: "anthropic", label: "Claude (Anthropic)", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-5-5", keyHint: "starts with sk-ant-", getKeyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "mistral", label: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-large-latest", keyHint: "from console.mistral.ai", getKeyUrl: "https://console.mistral.ai/api-keys" },
  { id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", keyHint: "starts with gsk_", getKeyUrl: "https://console.groq.com/keys" },
  { id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", keyHint: "starts with sk-", getKeyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "xai", label: "Grok (xAI)", kind: "openai", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-3", keyHint: "starts with xai-", getKeyUrl: "https://console.x.ai" },
  { id: "openrouter", label: "OpenRouter (many models)", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o-mini", keyHint: "starts with sk-or-", getKeyUrl: "https://openrouter.ai/keys" },
];

export const providerById = (id: string): ProviderInfo | undefined => PROVIDERS.find((p) => p.id === id);

/** Removes spaces, quotes and line breaks that sneak in when pasting. */
export const cleanApiKey = (s: unknown): string => (typeof s === "string" ? s.replace(/["'`\s]/g, "") : "");
export const apiKeyProblem = (key: string): string | null => {
  if (key.length < 10) return "That key is too short. Copy the whole key from the provider's website.";
  if (key.length > 400) return "That is too long to be an API key.";
  if (!/^[\x21-\x7e]+$/.test(key)) return "The key contains characters that are not allowed. Copy it again.";
  return null;
};
export const modelProblem = (m: string): string | null => (/^[A-Za-z0-9._:/@+-]{1,100}$/.test(m) ? null : "The model name may only contain letters, numbers and . _ : / - characters.");
