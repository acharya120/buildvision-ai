/** Browser helpers for /api/pm. Nothing here runs on the server. */
export interface PmStatus { dbConnected: boolean; loggedIn: boolean; blob: boolean; email?: string | null; userId?: string | null }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; conflict?: { current: number } };

export async function pmApi<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/pm/${path}`, { method, credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, status: res.status, error: typeof data.error === "string" ? data.error : "The request failed.", conflict: data.conflict as { current: number } | undefined };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "Could not reach the server. Check your connection." };
  }
}
export async function pmStatus(): Promise<PmStatus> {
  const r = await pmApi<PmStatus>("GET", "status");
  return r.ok ? r.data : { dbConnected: false, loggedIn: false, blob: false };
}

const vKey = (projectId: string, section: string) => `bv_pmv_${projectId}_${section}`;
/** The cloud version this browser last sent or received for a section (0 = never synced). */
export function knownVersion(projectId: string, section: string): number {
  try { const n = Number(window.localStorage.getItem(vKey(projectId, section))); return Number.isInteger(n) && n >= 0 ? n : 0; } catch { return 0; }
}
export function setKnownVersion(projectId: string, section: string, v: number): void {
  try { window.localStorage.setItem(vKey(projectId, section), String(v)); } catch { /* ignore */ }
}
export function readLocalSection(projectId: string, section: string): string | null {
  try { return window.localStorage.getItem(`bv_an_${projectId}_${section}`); } catch { return null; }
}
export function writeLocalSection(projectId: string, section: string, value: string): boolean {
  try { window.localStorage.setItem(`bv_an_${projectId}_${section}`, value); return true; } catch { return false; }
}

/** Shrinks a photo in the browser so it fits the 4 MB upload limit. Other file types are returned unchanged. */
export async function shrinkImage(file: File, maxSide = 2000, quality = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_200_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}
