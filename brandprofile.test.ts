import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/server/memoryRepo";
import { register, type Ctx } from "@/server/auth";
import { getBrand, saveBrand, toPublic } from "@/server/brand";
import { renderEmail, siteUrl } from "@/server/emailTemplate";
import { completeness, getProfile, saveProfile } from "@/server/profile";
import { checkImageDataUrl } from "@/server/images";
import type { Mailer, MailMessage } from "@/server/mail";
import type { UserRow } from "@/server/repo";

// 1x1 PNG and JPEG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

class Mailer1 implements Mailer {
  sent: MailMessage[] = [];
  async sender() { return { user: "owner@example.com", source: "database" as const }; }
  async send(m: MailMessage) { this.sent.push(m); }
}
const mk = (env: Ctx["env"] = { ADMIN_EMAIL: "owner@example.com", APP_SECRET: "s3cret" }) => {
  const repo = new MemoryRepo();
  const mailer = new Mailer1();
  const ctx: Ctx = { repo, mailer, env, now: () => 2_000_000 };
  return { ctx, repo, mailer };
};
const user = (id: string) => ({ id }) as UserRow;
const person = { name: "Asha <b>Rao</b>", email: "asha@example.com", phone: "+91 98765 43210", password: "goodpass1" };

describe("professional emails", () => {
  it("verification email is a designed HTML mail with the system name, big code and a plain-text twin", async () => {
    const { ctx, repo, mailer } = mk();
    await saveBrand(repo, { systemName: "Dream Homes", tagline: "Build better", purpose: "Home design for families.", ownerName: "Natwar Acharya", website: "https://example.com", address: "Jaipur, India", footerNote: "Need help? Reply here.", color: "#0a5c8f" });
    await register(ctx, person);
    const m = mailer.sent[0];
    expect(m.subject).toMatch(/^\d{6} is your Dream Homes verification code$/);
    expect(m.html).toContain("Dream Homes");
    expect(m.html).toContain("#0a5c8f");
    expect(m.html).toMatch(/letter-spacing:10px/);
    expect(m.html).toContain("Home design for families.");
    expect(m.html).toContain("Need help? Reply here.");
    expect(m.html).not.toContain("<b>Rao</b>"); // names are escaped
    expect(m.html).toContain("&lt;b&gt;Rao");
    expect(/\b(\d{6})\b/.exec(m.text)![1]).toBe(/(\d{6}) is your/.exec(m.subject)![1]);
    expect(m.text).not.toMatch(/<[a-z]/);
  });
  it("shows the logo only when a public address is known, and falls back to the defaults", () => {
    const b = { systemName: "X", tagline: "", purpose: "", ownerName: "", website: "", address: "", footerNote: "", color: "#178263", logo: PNG, logoVersion: 3 };
    expect(renderEmail(b, {}, { preheader: "p", heading: "h", paragraphs: ["a"] }).html).not.toContain("<img");
    expect(renderEmail(b, { VERCEL_PROJECT_PRODUCTION_URL: "my-app.vercel.app" }, { preheader: "p", heading: "h", paragraphs: ["a"] }).html).toContain('src="https://my-app.vercel.app/api/brand/logo?v=3"');
    expect(siteUrl({ APP_URL: "https://site.com/" })).toBe("https://site.com");
    expect(siteUrl({ APP_URL: "javascript:alert(1)" })).toBe("");
  });
  it("default look is unchanged when nothing is saved", async () => {
    const { repo } = mk();
    const b = await getBrand(repo);
    expect(b.systemName).toBe("BuildVision AI");
    expect(toPublic(b).logoUrl).toBe("");
  });
});

describe("system profile (admin)", () => {
  it("saves, validates, keeps the logo private in the public view", async () => {
    const { repo } = mk();
    expect((await saveBrand(repo, { systemName: "" })).ok).toBe(false);
    expect((await saveBrand(repo, { systemName: "A", website: "javascript:alert(1)" })).ok).toBe(false);
    expect((await saveBrand(repo, { systemName: "A", color: "red" })).ok).toBe(false);
    const ok = await saveBrand(repo, { systemName: "My <script>System", logo: PNG, color: "#112233" });
    expect(ok.ok).toBe(true);
    const b = await getBrand(repo);
    expect(b.systemName).not.toMatch(/[<>]/);
    expect(b.logo).toBe(PNG);
    expect(b.logoVersion).toBe(1);
    const pub = JSON.stringify(toPublic(b));
    expect(pub).not.toContain("base64");
    expect(pub).toContain("/api/brand/logo?v=1");
    // keep (logo left out) and remove (null)
    await saveBrand(repo, { systemName: "My System" });
    expect((await getBrand(repo)).logo).toBe(PNG);
    await saveBrand(repo, { systemName: "My System", logo: null });
    expect((await getBrand(repo)).logo).toBe("");
  });
  it("refuses SVG, fake pictures and huge files", async () => {
    const { repo } = mk();
    expect(checkImageDataUrl("data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==", 1e6).ok).toBe(false);
    expect(checkImageDataUrl("data:image/png;base64,AAAAAAAAAAAAAAAAAAAA", 1e6).ok).toBe(false);
    expect(checkImageDataUrl(PNG, 1e6).ok).toBe(true);
    expect(checkImageDataUrl(JPG, 1e6).ok).toBe(true);
    expect((await saveBrand(repo, { systemName: "A", logo: "data:image/png;base64," + "A".repeat(300_000) })).ok).toBe(false);
    expect((await saveBrand(repo, { systemName: "A", logo: "https://evil.example/x.png" })).ok).toBe(false);
  });
});

describe("user profile", () => {
  it("saves optional details per user and keeps users apart", async () => {
    const { ctx } = mk();
    expect(completeness(await getProfile(ctx, user("u1")))).toBe(0);
    const r = await saveProfile(ctx, user("u1"), { profession: "Architect", organisation: "Studio <x>", addressLine: "12 MG Road", city: "Pune", country: "India", website: "https://studio.example", bio: "Hello", photo: JPG });
    expect(r.ok).toBe(true);
    const p = await getProfile(ctx, user("u1"));
    expect(p.profession).toBe("Architect");
    expect(p.organisation).not.toMatch(/[<>]/);
    expect(p.photo).toBe(JPG);
    expect(completeness(p)).toBe(100);
    expect((await getProfile(ctx, user("u2"))).profession).toBe("");
    // photo kept when not sent, removed with null
    await saveProfile(ctx, user("u1"), { profession: "Engineer" });
    expect((await getProfile(ctx, user("u1"))).photo).toBe(JPG);
    await saveProfile(ctx, user("u1"), { profession: "Engineer", photo: null });
    expect((await getProfile(ctx, user("u1"))).photo).toBe("");
  });
  it("rejects bad websites, postal codes and pictures", async () => {
    const { ctx } = mk();
    expect((await saveProfile(ctx, user("u1"), { website: "ftp://x" })).ok).toBe(false);
    expect((await saveProfile(ctx, user("u1"), { postalCode: "<<>>" })).ok).toBe(false);
    expect((await saveProfile(ctx, user("u1"), { photo: "data:image/gif;base64,R0lGODlh" })).ok).toBe(false);
    expect((await saveProfile(ctx, user("u1"), { photo: "data:image/png;base64," + "A".repeat(200_000) })).ok).toBe(false);
    expect((await saveProfile(ctx, user("u1"), { bio: "x".repeat(5000) })).ok).toBe(true);
    expect((await getProfile(ctx, user("u1"))).bio.length).toBe(500);
  });
});
