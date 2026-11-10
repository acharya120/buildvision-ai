import type { Repo } from "./repo";
import { BRAND, DEFAULT_BRAND_COLOR, DEFAULT_PURPOSE, defaultPublicBrand, type PublicBrand } from "@/lib/brand";
import { checkImageDataUrl } from "./images";

export const LOGO_MAX_CHARS = 280_000;

export interface StoredBrand {
  systemName: string;
  tagline: string;
  purpose: string;
  ownerName: string;
  website: string;
  address: string;
  footerNote: string;
  color: string;
  /** data URL, or "" */
  logo: string;
  /** changes whenever the logo changes, so browsers and email programs fetch the new one */
  logoVersion: number;
}

export const DEFAULT_STORED: StoredBrand = {
  systemName: BRAND.product, tagline: BRAND.tagline, purpose: DEFAULT_PURPOSE, ownerName: BRAND.owner,
  website: "", address: "", footerNote: "", color: DEFAULT_BRAND_COLOR, logo: "", logoVersion: 0,
};

const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, " ").trim().slice(0, max) : fallback);

export async function getBrand(repo: Repo): Promise<StoredBrand> {
  try {
    const raw = await repo.getSetting("brand");
    if (!raw) return { ...DEFAULT_STORED };
    const d = JSON.parse(raw) as Partial<StoredBrand>;
    const logo = typeof d.logo === "string" && checkImageDataUrl(d.logo, LOGO_MAX_CHARS).ok ? d.logo : "";
    return {
      systemName: str(d.systemName, 60) || DEFAULT_STORED.systemName,
      tagline: str(d.tagline, 100, DEFAULT_STORED.tagline),
      purpose: str(d.purpose, 400, DEFAULT_STORED.purpose),
      ownerName: str(d.ownerName, 80, DEFAULT_STORED.ownerName),
      website: str(d.website, 200),
      address: str(d.address, 300),
      footerNote: str(d.footerNote, 300),
      color: typeof d.color === "string" && /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : DEFAULT_BRAND_COLOR,
      logo,
      logoVersion: Number.isInteger(d.logoVersion) ? (d.logoVersion as number) : 0,
    };
  } catch {
    return { ...DEFAULT_STORED };
  }
}

export const toPublic = (b: StoredBrand): PublicBrand => ({
  ...defaultPublicBrand(),
  name: b.systemName, tagline: b.tagline, purpose: b.purpose, owner: b.ownerName, website: b.website, address: b.address,
  footerNote: b.footerNote, color: b.color, logoUrl: b.logo ? `/api/brand/logo?v=${b.logoVersion}` : "",
});

/** `logo`: leave out to keep the current one, null to remove it, or a data URL to replace it. */
export async function saveBrand(repo: Repo, raw: unknown): Promise<{ ok: true; value: StoredBrand } | { ok: false; error: string }> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cur = await getBrand(repo);
  const systemName = str(r.systemName, 60);
  if (!systemName) return { ok: false, error: "The system name cannot be empty." };
  const website = str(r.website, 200);
  if (website && !/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(website)) return { ok: false, error: "The website must start with http:// or https://" };
  const color = typeof r.color === "string" && r.color ? r.color.trim() : DEFAULT_BRAND_COLOR;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, error: "The brand colour must look like #178263." };
  let logo = cur.logo;
  let logoVersion = cur.logoVersion;
  if (r.logo === null) {
    logo = "";
    logoVersion++;
  } else if (typeof r.logo === "string" && r.logo !== cur.logo) {
    const c = checkImageDataUrl(r.logo, LOGO_MAX_CHARS);
    if (!c.ok) return { ok: false, error: c.error };
    logo = r.logo;
    logoVersion++;
  }
  const value: StoredBrand = {
    systemName, tagline: str(r.tagline, 100), purpose: str(r.purpose, 400), ownerName: str(r.ownerName, 80),
    website, address: str(r.address, 300), footerNote: str(r.footerNote, 300), color, logo, logoVersion,
  };
  await repo.setSetting("brand", JSON.stringify(value));
  return { ok: true, value };
}
