/** Branding shown in the app, exports and page metadata. Change these values to rebrand. */
export const BRAND = {
  product: "BuildVision AI",
  owner: "Natwar Acharya",
  credit: "by Natwar Acharya",
  monogram: "NA",
  email: "acharyanatwar102@gmail.com",
  phone: "+918851496250",
  phoneDisplay: "+91 88514 96250",
  tagline: "Plan it. See it. Estimate it.",
} as const;

/** What every visitor may see. The owner edits it in Settings > System profile; with nothing saved these defaults apply. */
export interface PublicBrand {
  name: string;
  tagline: string;
  purpose: string;
  owner: string;
  website: string;
  address: string;
  footerNote: string;
  color: string;
  /** address of the uploaded logo, or "" for the built-in mark */
  logoUrl: string;
}
export const DEFAULT_PURPOSE = "Conceptual house design, 3D visualization and preliminary cost estimation.";
export const DEFAULT_BRAND_COLOR = "#178263";
export const defaultPublicBrand = (): PublicBrand => ({
  name: BRAND.product,
  tagline: BRAND.tagline,
  purpose: DEFAULT_PURPOSE,
  owner: BRAND.owner,
  website: "",
  address: "",
  footerNote: "",
  color: DEFAULT_BRAND_COLOR,
  logoUrl: "",
});
