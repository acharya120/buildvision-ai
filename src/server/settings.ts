import type { Repo } from "./repo";

export interface GeneralSettings {
  allowRegistration: boolean;
  contactEmail: string;
  contactPhone: string;
}
export const DEFAULT_GENERAL: GeneralSettings = { allowRegistration: true, contactEmail: "", contactPhone: "" };

export async function getGeneral(repo: Repo): Promise<GeneralSettings> {
  try {
    const raw = await repo.getSetting("general");
    if (!raw) return { ...DEFAULT_GENERAL };
    const d = JSON.parse(raw) as Partial<GeneralSettings>;
    return {
      allowRegistration: d.allowRegistration !== false,
      contactEmail: typeof d.contactEmail === "string" ? d.contactEmail.slice(0, 254) : "",
      contactPhone: typeof d.contactPhone === "string" ? d.contactPhone.slice(0, 30) : "",
    };
  } catch {
    return { ...DEFAULT_GENERAL };
  }
}

export async function saveGeneral(repo: Repo, raw: unknown): Promise<{ ok: true; value: GeneralSettings } | { ok: false; error: string }> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const contactEmail = typeof r.contactEmail === "string" ? r.contactEmail.trim() : "";
  const contactPhone = typeof r.contactPhone === "string" ? r.contactPhone.trim() : "";
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) return { ok: false, error: "The contact email is not a valid email address." };
  if (contactPhone && !/^[+\d\s\-()]{7,30}$/.test(contactPhone)) return { ok: false, error: "The contact phone number is not valid." };
  const value: GeneralSettings = { allowRegistration: r.allowRegistration !== false, contactEmail, contactPhone };
  await repo.setSetting("general", JSON.stringify(value));
  return { ok: true, value };
}
