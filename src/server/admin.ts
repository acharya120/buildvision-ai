import { buildStoredMail, cleanAppPassword, loadMailConfig, sendWithConfig, verifyMailConfig, type MailConfig } from "./mail";
import type { Ctx } from "./auth";
import { getGeneral, saveGeneral } from "./settings";
import { aiOverview } from "./ai";
import { getBrand } from "./brand";
import { renderEmail } from "./emailTemplate";
import type { UserRow } from "./repo";

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const HOST_OK = /^[a-z0-9.-]{3,100}$/i;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function adminOverview(ctx: Ctx) {
  const mail = await loadMailConfig(ctx.repo, ctx.env);
  const counts = await ctx.repo.counts();
  return {
    ok: true as const,
    general: await getGeneral(ctx.repo),
    mail: mail ? { connected: true, host: mail.host, port: mail.port, user: mail.user, fromName: mail.fromName, source: mail.source, hasPassword: true } : { connected: false, host: "smtp.gmail.com", port: 465, user: "", fromName: "BuildVision AI", source: null, hasPassword: false },
    ai: await aiOverview(ctx),
    database: { connected: true, users: counts.users, projects: counts.projects },
    env: { appSecret: !!ctx.env.APP_SECRET, adminEmail: !!ctx.env.ADMIN_EMAIL },
  };
}

export const updateGeneral = (ctx: Ctx, raw: unknown) => saveGeneral(ctx.repo, raw);

/** Paste the mail app password: it is checked against the mail server first, and only saved when the login works. */
export async function connectMail(ctx: Ctx, raw: unknown): Promise<{ ok: true; user: string } | Fail> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const host = typeof r.host === "string" && r.host.trim() ? r.host.trim() : "smtp.gmail.com";
  const port = Number(r.port) || 465;
  const user = typeof r.user === "string" ? r.user.trim() : "";
  const fromName = typeof r.fromName === "string" && r.fromName.trim() ? r.fromName.trim().slice(0, 60) : "BuildVision AI";
  let password = typeof r.password === "string" ? cleanAppPassword(r.password) : "";
  if (!HOST_OK.test(host)) return fail(400, "The mail server host is not valid.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail(400, "The port must be a number such as 465 or 587.");
  if (!EMAIL_OK.test(user)) return fail(400, "Enter the email address the mails should be sent from.");
  if (!ctx.env.APP_SECRET) return fail(500, "APP_SECRET is not set on the server, so the key cannot be stored safely. Add it in Vercel (see the setup guide).");
  if (!password) {
    // keep the saved key when only the other fields are changed
    const cur = await loadMailConfig(ctx.repo, ctx.env);
    if (!cur) return fail(400, "Paste the app password (security key) first.");
    password = cur.pass;
  }
  const cfg: MailConfig = { host, port, secure: port === 465, user, pass: password, fromName, source: "database" };
  try {
    await verifyMailConfig(cfg);
  } catch (e) {
    return fail(400, e instanceof Error ? e.message : "The mail server refused the login.");
  }
  await ctx.repo.setSetting("mail", JSON.stringify(buildStoredMail({ host, port, user, password, fromName }, ctx.env.APP_SECRET)));
  return { ok: true, user };
}

export async function disconnectMail(ctx: Ctx): Promise<{ ok: true }> {
  await ctx.repo.setSetting("mail", "");
  return { ok: true };
}

export async function sendTestMail(ctx: Ctx, to: string): Promise<{ ok: true; from: string; to: string } | Fail> {
  const cfg = await loadMailConfig(ctx.repo, ctx.env);
  if (!cfg) return fail(400, "No mail app is connected yet.");
  if (!EMAIL_OK.test(to)) return fail(400, "Enter a valid address to send the test to.");
  try {
    const brand = await getBrand(ctx.repo);
    const mail = renderEmail(brand, ctx.env, {
      preheader: "Your mail connection works.",
      heading: "Your email connection works",
      paragraphs: [`This is a test message from ${brand.systemName}.`, `Emails are being sent from ${cfg.user}. This is how verification and other emails will look to your users.`],
      code: "123456",
      codeNote: "Example of a verification code",
    });
    await sendWithConfig(cfg, { to, subject: `${brand.systemName} test email`, text: mail.text, html: mail.html });
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "Sending failed.");
  }
  return { ok: true, from: cfg.user, to };
}

export const listUsers = async (ctx: Ctx) =>
  (await ctx.repo.listUsers()).map((u: UserRow) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, verified: u.verified, disabled: u.disabled, createdAt: u.createdAt, lastLogin: u.lastLogin }));

export async function userAction(ctx: Ctx, adminId: string, raw: unknown): Promise<{ ok: true } | Fail> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const action = r.action;
  const target = await ctx.repo.findUserById(id);
  if (!target) return fail(404, "That user was not found.");
  if (target.id === adminId) return fail(400, "You cannot change your own account here.");
  switch (action) {
    case "disable":
      await ctx.repo.updateUser(id, { disabled: true });
      await ctx.repo.deleteUserSessions(id);
      return { ok: true };
    case "enable":
      await ctx.repo.updateUser(id, { disabled: false });
      return { ok: true };
    case "makeAdmin":
      await ctx.repo.updateUser(id, { role: "admin" });
      return { ok: true };
    case "removeAdmin":
      await ctx.repo.updateUser(id, { role: "user" });
      return { ok: true };
    case "delete":
      await ctx.repo.deleteUser(id);
      return { ok: true };
    default:
      return fail(400, "Unknown action.");
  }
}
