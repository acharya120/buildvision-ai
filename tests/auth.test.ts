import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/server/memoryRepo";
import { login, logout, register, resendCode, userFromToken, verifyEmail, type Ctx, MAX_CODE_ATTEMPTS } from "@/server/auth";
import { adminOverview, connectMail, listUsers, userAction } from "@/server/admin";
import { decryptText, encryptText, hashPassword, makeCode, verifyPassword } from "@/server/crypto";
import { validatePassword, validateRegister } from "@/server/validate";
import { saveCloudProject, listCloudProjects, deleteCloudProject, setKvValue, getKvValue } from "@/server/projects";
import { getGeneral, saveGeneral } from "@/server/settings";
import { buildStoredMail } from "@/server/mail";
import type { Mailer, MailMessage } from "@/server/mail";
import { SAMPLES } from "@/lib/model/samples";

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  on = true;
  fail = false;
  async sender() { return this.on ? { user: "owner@example.com", source: "database" as const } : null; }
  async send(m: MailMessage) { if (this.fail) throw new Error("smtp down"); this.sent.push(m); }
  lastCode(): string { const m = this.sent[this.sent.length - 1]; return /\b(\d{6})\b/.exec(m.text)![1]; }
}
const mk = (env: Ctx["env"] = { ADMIN_EMAIL: "owner@example.com", APP_SECRET: "s3cret" }) => {
  const repo = new MemoryRepo();
  const mailer = new FakeMailer();
  let t = 1_000_000;
  const ctx: Ctx = { repo, mailer, env, now: () => t };
  return { ctx, repo, mailer, tick: (ms: number) => (t += ms) };
};
const person = { name: "Asha Rao", email: "Asha@Example.com", phone: "+91 98765 43210", password: "goodpass1" };

describe("validation and crypto", () => {
  it("checks the registration form", () => {
    expect(validateRegister(person).ok).toBe(true);
    expect(validateRegister({ ...person, name: "A" }).ok).toBe(false);
    expect(validateRegister({ ...person, email: "nope" }).ok).toBe(false);
    expect(validateRegister({ ...person, phone: "12" }).ok).toBe(false);
    expect(validateRegister({ ...person, phone: "abc12345678" }).ok).toBe(false);
    expect(validatePassword("short1")).toBeTruthy();
    expect(validatePassword("alllettersss")).toBeTruthy();
    expect(validatePassword("12345678")).toBeTruthy();
    expect(validatePassword("goodpass1")).toBeNull();
  });
  it("hashes passwords and encrypts secrets", () => {
    const h = hashPassword("goodpass1");
    expect(h).not.toContain("goodpass1");
    expect(verifyPassword("goodpass1", h)).toBe(true);
    expect(verifyPassword("goodpass2", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
    const enc = encryptText("abcd efgh", "k");
    expect(enc).not.toContain("abcd");
    expect(decryptText(enc, "k")).toBe("abcd efgh");
    expect(decryptText(enc, "other")).toBeNull();
    expect(makeCode()).toMatch(/^\d{6}$/);
  });
});

describe("register, verify, login", () => {
  it("full journey: register, code by email, verify, then log in with email and password", async () => {
    const { ctx, mailer, repo } = mk();
    const r = await register(ctx, person);
    expect(r.ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("asha@example.com");
    const u = (await repo.findUserByEmail("asha@example.com"))!;
    expect(u.verified).toBe(false);
    expect(u.role).toBe("user");
    expect(u.passwordHash).not.toContain("goodpass1");
    // cannot log in before verifying
    const early = await login(ctx, { email: "asha@example.com", password: "goodpass1" });
    expect(!early.ok && early.needsVerification).toBe(true);
    const v = await verifyEmail(ctx, { email: "asha@example.com", code: mailer.lastCode() });
    expect(v.ok).toBe(true);
    const l = await login(ctx, { email: "ASHA@example.com", password: "goodpass1" });
    expect(l.ok).toBe(true);
    if (l.ok) {
      expect(l.user.role).toBe("user");
      expect((await userFromToken(ctx, l.token))?.email).toBe("asha@example.com");
      await logout(ctx, l.token);
      expect(await userFromToken(ctx, l.token)).toBeNull();
    }
  });
  it("wrong code, expired code and too many tries", async () => {
    const { ctx, mailer, tick } = mk();
    await register(ctx, person);
    const good = mailer.lastCode();
    const wrong = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) expect((await verifyEmail(ctx, { email: "asha@example.com", code: wrong })).ok).toBe(false);
    const locked = await verifyEmail(ctx, { email: "asha@example.com", code: good });
    expect(!locked.ok && locked.status).toBe(429);
    tick(70_000);
    expect((await resendCode(ctx, { email: "asha@example.com" })).ok).toBe(true);
    expect(mailer.sent).toHaveLength(2);
    tick(11 * 60_000);
    const expired = await verifyEmail(ctx, { email: "asha@example.com", code: mailer.lastCode() });
    expect(!expired.ok && expired.error).toMatch(/expired/);
  });
  it("resend is rate limited and does not reveal whether an account exists", async () => {
    const { ctx, mailer } = mk();
    await register(ctx, person);
    const again = await resendCode(ctx, { email: "asha@example.com" });
    expect(!again.ok && again.status).toBe(429);
    expect((await resendCode(ctx, { email: "nobody@example.com" })).ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
  });
  it("rejects duplicates, wrong passwords and locks after repeated failures", async () => {
    const { ctx, mailer, tick } = mk();
    await register(ctx, person);
    await verifyEmail(ctx, { email: "asha@example.com", code: mailer.lastCode() });
    const dup = await register(ctx, person);
    expect(!dup.ok && dup.status).toBe(409);
    for (let i = 0; i < 5; i++) {
      const bad = await login(ctx, { email: "asha@example.com", password: "wrongpass1" });
      expect(!bad.ok && bad.error).toBe("Wrong email or password.");
    }
    const locked = await login(ctx, { email: "asha@example.com", password: "goodpass1" });
    expect(!locked.ok && locked.status).toBe(429);
    tick(16 * 60_000);
    expect((await login(ctx, { email: "asha@example.com", password: "goodpass1" })).ok).toBe(true);
    const ghost = await login(ctx, { email: "ghost@example.com", password: "whatever1" });
    expect(!ghost.ok && ghost.error).toBe("Wrong email or password.");
  });
  it("re-registering an unverified address replaces the details", async () => {
    const { ctx, mailer, repo } = mk();
    await register(ctx, person);
    await register(ctx, { ...person, name: "Asha R", password: "newpass99" });
    expect(mailer.sent).toHaveLength(2);
    await verifyEmail(ctx, { email: "asha@example.com", code: mailer.lastCode() });
    expect((await repo.findUserByEmail("asha@example.com"))!.name).toBe("Asha R");
    expect((await login(ctx, { email: "asha@example.com", password: "newpass99" })).ok).toBe(true);
    expect((await login(ctx, { email: "asha@example.com", password: "goodpass1" })).ok).toBe(false);
  });
  it("tells the person when mail is not set up, or sending fails", async () => {
    const a = mk();
    a.mailer.on = false;
    const r1 = await register(a.ctx, person);
    expect(!r1.ok && r1.status).toBe(503);
    const b = mk();
    b.mailer.fail = true;
    const r2 = await register(b.ctx, person);
    expect(!r2.ok && r2.status).toBe(502);
    expect(await b.repo.getCode((await b.repo.findUserByEmail("asha@example.com"))!.id)).toBeNull();
  });
  it("makes ADMIN_EMAIL the admin; without it the first account is admin", async () => {
    const a = mk();
    await register(a.ctx, { ...person, email: "owner@example.com" });
    await register(a.ctx, { ...person, email: "other@example.com" });
    expect((await a.repo.findUserByEmail("owner@example.com"))!.role).toBe("admin");
    expect((await a.repo.findUserByEmail("other@example.com"))!.role).toBe("user");
    const b = mk({ APP_SECRET: "x" });
    await register(b.ctx, { ...person, email: "first@example.com" });
    await register(b.ctx, { ...person, email: "second@example.com" });
    expect((await b.repo.findUserByEmail("first@example.com"))!.role).toBe("admin");
    expect((await b.repo.findUserByEmail("second@example.com"))!.role).toBe("user");
  });
  it("disabled users cannot log in and their sessions end", async () => {
    const { ctx, mailer, repo } = mk();
    await register(ctx, { ...person, email: "owner@example.com" });
    await verifyEmail(ctx, { email: "owner@example.com", code: mailer.lastCode() });
    await register(ctx, person);
    await verifyEmail(ctx, { email: "asha@example.com", code: mailer.lastCode() });
    const l = await login(ctx, { email: "asha@example.com", password: "goodpass1" });
    const admin = (await repo.findUserByEmail("owner@example.com"))!;
    const asha = (await repo.findUserByEmail("asha@example.com"))!;
    expect((await userAction(ctx, admin.id, { id: asha.id, action: "disable" })).ok).toBe(true);
    if (l.ok) expect(await userFromToken(ctx, l.token)).toBeNull();
    const again = await login(ctx, { email: "asha@example.com", password: "goodpass1" });
    expect(!again.ok && again.status).toBe(403);
  });
});

describe("registration switch and admin tools", () => {
  it("closed registration blocks everyone but the owner", async () => {
    const { ctx } = mk();
    await saveGeneral(ctx.repo, { allowRegistration: false });
    const r = await register(ctx, person);
    expect(!r.ok && r.status).toBe(403);
    expect((await register(ctx, { ...person, email: "owner@example.com" })).ok).toBe(true);
  });
  it("validates contact settings", async () => {
    const { ctx } = mk();
    expect((await saveGeneral(ctx.repo, { contactEmail: "bad" })).ok).toBe(false);
    expect((await saveGeneral(ctx.repo, { contactEmail: "a@b.co", contactPhone: "+91 88514 96250" })).ok).toBe(true);
    expect((await getGeneral(ctx.repo)).contactPhone).toBe("+91 88514 96250");
  });
  it("admin cannot change own account; can promote, delete", async () => {
    const { ctx, mailer, repo } = mk();
    await register(ctx, { ...person, email: "owner@example.com" });
    await verifyEmail(ctx, { email: "owner@example.com", code: mailer.lastCode() });
    await register(ctx, person);
    const admin = (await repo.findUserByEmail("owner@example.com"))!;
    const asha = (await repo.findUserByEmail("asha@example.com"))!;
    expect((await userAction(ctx, admin.id, { id: admin.id, action: "delete" })).ok).toBe(false);
    expect((await userAction(ctx, admin.id, { id: asha.id, action: "makeAdmin" })).ok).toBe(true);
    expect((await listUsers(ctx)).find((u) => u.id === asha.id)!.role).toBe("admin");
    expect((await userAction(ctx, admin.id, { id: asha.id, action: "delete" })).ok).toBe(true);
    expect(await repo.findUserById(asha.id)).toBeNull();
    expect((await userAction(ctx, admin.id, { id: asha.id, action: "nope" })).ok).toBe(false);
  });
  it("mail key is stored encrypted and never returned", async () => {
    const { ctx, repo } = mk();
    const stored = buildStoredMail({ host: "smtp.gmail.com", port: 465, user: "me@gmail.com", password: "abcd efgh ijkl mnop", fromName: "X" }, "s3cret");
    await repo.setSetting("mail", JSON.stringify(stored));
    const raw = (await repo.getSetting("mail"))!;
    expect(raw).not.toContain("abcdefgh");
    expect(raw).not.toContain("abcd efgh");
    const ov = await adminOverview(ctx);
    expect(ov.mail.connected).toBe(true);
    expect(ov.mail.user).toBe("me@gmail.com");
    expect(JSON.stringify(ov)).not.toContain("abcdefgh");
    const bad = await connectMail(ctx, { user: "not-an-email", password: "x" });
    expect(bad.ok).toBe(false);
    const noSecret = await connectMail({ ...ctx, env: {} }, { user: "me@gmail.com", password: "abcdefghijklmnop" });
    expect(!noSecret.ok && noSecret.error).toMatch(/APP_SECRET/);
  });
});

describe("cloud projects", () => {
  it("stores valid projects per user and rejects bad ones", async () => {
    const { ctx } = mk();
    const p = SAMPLES[0].build();
    expect((await saveCloudProject(ctx, "u1", { project: p })).ok).toBe(true);
    expect((await saveCloudProject(ctx, "u1", { project: { nonsense: true } })).ok).toBe(false);
    expect((await saveCloudProject(ctx, "u1", { project: { ...p, id: "bad id!" } })).ok).toBe(false);
    expect(await listCloudProjects(ctx, "u1")).toHaveLength(1);
    expect(await listCloudProjects(ctx, "u2")).toHaveLength(0);
    await deleteCloudProject(ctx, "u2", p.id);
    expect(await listCloudProjects(ctx, "u1")).toHaveLength(1);
    await deleteCloudProject(ctx, "u1", p.id);
    expect(await listCloudProjects(ctx, "u1")).toHaveLength(0);
  });
  it("kv only accepts known keys and JSON", async () => {
    const { ctx } = mk();
    expect((await setKvValue(ctx, "u1", "roomLibrary", "{}")).ok).toBe(true);
    expect(await getKvValue(ctx, "u1", "roomLibrary")).toBe("{}");
    expect((await setKvValue(ctx, "u1", "other", "{}")).ok).toBe(false);
    expect((await setKvValue(ctx, "u1", "roomLibrary", "not json")).ok).toBe(false);
    expect(await getKvValue(ctx, "u2", "roomLibrary")).toBeNull();
  });
});
