import type { Ctx } from "./auth";
import type { UserRow } from "./repo";
import { checkImageDataUrl } from "./images";

export const PHOTO_MAX_CHARS = 160_000;

export interface Profile {
  profession: string;
  organisation: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  website: string;
  bio: string;
  /** data URL of the profile picture, or "" */
  photo: string;
  updatedAt: number;
}
const EMPTY: Profile = { profession: "", organisation: "", addressLine: "", city: "", state: "", postalCode: "", country: "", website: "", bio: "", photo: "", updatedAt: 0 };
const TEXT_FIELDS: Array<[keyof Profile, number]> = [["profession", 80], ["organisation", 100], ["addressLine", 200], ["city", 80], ["state", 80], ["postalCode", 20], ["country", 80], ["website", 200], ["bio", 500]];
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, " ").trim().slice(0, max) : "");

/** share of the useful fields that are filled in, 0 to 100 */
export const completeness = (p: Profile): number => {
  const keys: Array<keyof Profile> = ["profession", "organisation", "addressLine", "city", "country", "photo"];
  return Math.round((keys.filter((k) => !!p[k]).length / keys.length) * 100);
};

export async function getProfile(ctx: Ctx, user: UserRow): Promise<Profile> {
  try {
    const raw = await ctx.repo.getKv(user.id, "profile");
    if (!raw) return { ...EMPTY };
    const d = JSON.parse(raw) as Partial<Profile>;
    const p: Profile = { ...EMPTY, updatedAt: Number(d.updatedAt) || 0 };
    for (const [k, max] of TEXT_FIELDS) (p[k] as string) = clean(d[k], max);
    p.photo = typeof d.photo === "string" && checkImageDataUrl(d.photo, PHOTO_MAX_CHARS).ok ? d.photo : "";
    return p;
  } catch {
    return { ...EMPTY };
  }
}

export async function saveProfile(ctx: Ctx, user: UserRow, raw: unknown): Promise<{ ok: true; profile: Profile } | { ok: false; status: number; error: string }> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cur = await getProfile(ctx, user);
  const p: Profile = { ...EMPTY, photo: cur.photo, updatedAt: ctx.now() };
  for (const [k, max] of TEXT_FIELDS) (p[k] as string) = clean(r[k], max);
  if (p.website && !/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(p.website)) return { ok: false, status: 400, error: "The website must start with http:// or https://" };
  if (p.postalCode && !/^[A-Za-z0-9 -]{3,20}$/.test(p.postalCode)) return { ok: false, status: 400, error: "The postal code is not valid." };
  if (r.photo === null) p.photo = "";
  else if (typeof r.photo === "string" && r.photo !== cur.photo) {
    const c = checkImageDataUrl(r.photo, PHOTO_MAX_CHARS);
    if (!c.ok) return { ok: false, status: 400, error: c.error };
    p.photo = r.photo;
  }
  await ctx.repo.setKv(user.id, "profile", JSON.stringify(p));
  return { ok: true, profile: p };
}
