import type { StoredBrand } from "./brand";
import type { Env } from "./env";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Public address of the site, used so the logo can be shown inside emails. Empty when unknown. */
export function siteUrl(env: Env): string {
  const a = (env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(a)) return a;
  const v = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return v ? `https://${v}` : "";
}

export interface EmailParts {
  /** hidden preview line shown next to the subject in the inbox */
  preheader: string;
  heading: string;
  /** first paragraphs, plain text */
  paragraphs: string[];
  /** a big highlighted code, such as the 6 digit verification code */
  code?: string;
  codeNote?: string;
  /** paragraphs shown under the code */
  after?: string[];
  button?: { label: string; url: string };
}

/** One professional layout for every email the system sends: coloured header with logo and name, card, footer with contact details. */
export function renderEmail(brand: StoredBrand, env: Env, p: EmailParts): { html: string; text: string } {
  const color = /^#[0-9a-fA-F]{6}$/.test(brand.color) ? brand.color : "#178263";
  const base = siteUrl(env);
  const logo = brand.logo && base ? `${base}/api/brand/logo?v=${brand.logoVersion}` : "";
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const para = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${esc(t)}</p>`;
  const contact = [brand.ownerName && esc(brand.ownerName), brand.address && esc(brand.address), brand.website && `<a href="${esc(brand.website)}" style="color:${color};text-decoration:none">${esc(brand.website)}</a>`].filter(Boolean).join(" &middot; ");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(p.heading)}</title></head>
<body style="margin:0;padding:0;background:#eef2f1;font-family:${font}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef2f1">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="background:${color};border-radius:14px 14px 0 0;padding:26px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${logo ? `<td style="padding-right:14px;vertical-align:middle"><img src="${esc(logo)}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:10px;background:#fff;object-fit:contain"></td>` : ""}
<td style="vertical-align:middle"><div style="font-size:22px;font-weight:700;line-height:1.2;color:#ffffff">${esc(brand.systemName)}</div>${brand.tagline ? `<div style="margin-top:3px;font-size:13px;color:#e6f5ef">${esc(brand.tagline)}</div>` : ""}</td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 8px;border-left:1px solid #dfe6e4;border-right:1px solid #dfe6e4">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a">${esc(p.heading)}</h1>
${p.paragraphs.map(para).join("")}
${p.code ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td align="center" style="background:#f3faf7;border:2px dashed ${color};border-radius:12px;padding:20px 10px"><div style="font-family:'Courier New',Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:10px;color:${color};padding-left:10px">${esc(p.code)}</div>${p.codeNote ? `<div style="margin-top:8px;font-size:13px;color:#64748b">${esc(p.codeNote)}</div>` : ""}</td></tr></table>` : ""}
${(p.after ?? []).map(para).join("")}
${p.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="background:${color};border-radius:8px"><a href="${esc(p.button.url)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${esc(p.button.label)}</a></td></tr></table>` : ""}
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #dfe6e4;border-top:0;border-radius:0 0 14px 14px;padding:0 28px 24px">
<div style="border-top:1px solid #e5ece9;padding-top:16px;font-size:12px;line-height:1.7;color:#64748b">
${brand.footerNote ? `<div style="margin-bottom:6px">${esc(brand.footerNote)}</div>` : ""}
${brand.purpose ? `<div style="margin-bottom:6px">${esc(brand.purpose)}</div>` : ""}
${contact ? `<div>${contact}</div>` : ""}
<div style="margin-top:8px;color:#94a3b8">This email was sent automatically by ${esc(brand.systemName)}. Please do not share the codes in it with anyone.</div>
</div></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${brand.systemName}${brand.tagline ? " - " + brand.tagline : ""}`, "", p.heading, "", ...p.paragraphs.flatMap((x) => [x, ""]),
    ...(p.code ? [`    ${p.code}`, ...(p.codeNote ? [p.codeNote] : []), ""] : []),
    ...(p.after ?? []).flatMap((x) => [x, ""]),
    ...(p.button ? [`${p.button.label}: ${p.button.url}`, ""] : []),
    "--", brand.footerNote, brand.purpose, [brand.ownerName, brand.address, brand.website].filter(Boolean).join(" | "),
  ].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n").trim();
  return { html, text };
}
