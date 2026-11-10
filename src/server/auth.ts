import { getBrand } from "./brand";
import { renderEmail } from "./emailTemplate";
import { BRAND } from "@/lib/brand";
import { hashPassword, makeCode, randomId, randomToken, safeEqual, sha256, verifyPassword } from "./crypto";
import type { Env } from "./env";
import type { Mailer } from "./mail";
import type { Repo, Role, UserRow } from "./repo";
import { getGeneral } from "./settings";
import { normEmail, validCode, validateRegister } from "./validate";

export interface Ctx {
  repo: Repo;
  mailer: Mailer;
  env: Env;
  now: () => number;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
}
export const toPublic = (u: UserRow): PublicUser => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

export type Fail = { ok: false; status: number; error: string; needsVerification?: boolean; email?: string };
export type Res<T> = ({ ok: true } & T) | Fail;
const fail = (status: number, error: string, extra?: Partial<Fail>): Fail => ({ ok: false, status, error, ...extra });

export const CODE_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_SECONDS = 60;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const SESSION_DAYS = 30;

/** The owner's address (ADMIN_EMAIL) becomes admin. If it is not set, the very first account does. */
async function roleForNew(ctx: Ctx, email: string): Promise<Role> {
  const admin = normEmail(ctx.env.ADMIN_EMAIL);
  if (admin) return email === admin ? "admin" : "user";
  return (await ctx.repo.countUsers()) === 0 ? "admin" : "user";
}

async function sendCode(ctx: Ctx, user: UserRow, force: boolean): Promise<Fail | null> {
  const now = ctx.now();
  const old = await ctx.repo.getCode(user.id);
  if (!force && old && now - old.createdAt < RESEND_SECONDS * 1000) {
    return fail(429, `Please wait ${Math.ceil((RESEND_SECONDS * 1000 - (now - old.createdAt)) / 1000)} seconds before asking for another code.`);
  }
  if (!(await ctx.mailer.sender())) {
    return fail(503, "Email sending is not set up yet, so the verification code cannot be sent. The site owner needs to connect the mail app (see the setup guide).");
  }
  const code = makeCode();
  await ctx.repo.saveCode({ userId: user.id, codeHash: sha256(`${user.id}:${code}`), expiresAt: now + CODE_MINUTES * 60_000, attempts: 0, createdAt: now });
  try {
    const brand = await getBrand(ctx.repo);
    const mail = renderEmail(brand, ctx.env, {
      preheader: `Your ${brand.systemName} verification code is ${code}`,
      heading: "Verify your email address",
      paragraphs: [`Hello ${user.name},`, `Welcome to ${brand.systemName}. Please enter this 6 digit code on the sign-up page to confirm your email address.`],
      code,
      codeNote: `This code works for ${CODE_MINUTES} minutes.`,
      after: ["If you did not create an account, you can safely ignore this email. Nobody can use your address without this code."],
    });
    await ctx.mailer.send({ to: user.email, subject: `${code} is your ${brand.systemName} verification code`, text: mail.text, html: mail.html });
  } catch (e) {
    await ctx.repo.deleteCode(user.id);
    return fail(502, `The verification email could not be sent. ${e instanceof Error ? e.message : ""}`.trim());
  }
  return null;
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export async function register(ctx: Ctx, raw: unknown): Promise<Res<{ email: string }>> {
  const v = validateRegister(raw);
  if (!v.ok) return fail(400, v.error);
  const { name, email, phone, password } = v.value;
  const isOwner = !!ctx.env.ADMIN_EMAIL && email === normEmail(ctx.env.ADMIN_EMAIL);
  if (!isOwner && !(await getGeneral(ctx.repo)).allowRegistration) return fail(403, "New registrations are closed right now.");

  let user = await ctx.repo.findUserByEmail(email);
  if (user && user.verified) return fail(409, "An account with this email already exists. Please log in.");
  if (user) {
    // an earlier sign-up was never verified: let the person start again with the new details
    await ctx.repo.updateUser(user.id, { name, phone, passwordHash: hashPassword(password) });
    user = { ...user, name, phone };
  } else {
    user = { id: randomId(), name, email, phone, passwordHash: hashPassword(password), role: await roleForNew(ctx, email), verified: false, disabled: false, failedLogins: 0, lockedUntil: 0, createdAt: ctx.now(), lastLogin: 0 };
    await ctx.repo.createUser(user);
  }
  const err = await sendCode(ctx, user, true);
  if (err) return err;
  return { ok: true, email };
}

export async function resendCode(ctx: Ctx, raw: unknown): Promise<Res<{ email: string }>> {
  const email = normEmail((raw as { email?: unknown } | null)?.email);
  const user = email ? await ctx.repo.findUserByEmail(email) : null;
  // same answer whether or not the account exists
  if (!user || user.verified || user.disabled) return { ok: true, email };
  const err = await sendCode(ctx, user, false);
  return err ?? { ok: true, email };
}

export async function verifyEmail(ctx: Ctx, raw: unknown): Promise<Res<{ email: string }>> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const email = normEmail(r.email);
  const code = validCode(r.code);
  if (!email || !code) return fail(400, "Enter the 6 digit code from your email.");
  const user = await ctx.repo.findUserByEmail(email);
  const row = user ? await ctx.repo.getCode(user.id) : null;
  if (!user || !row) return fail(400, "That code is not valid. Ask for a new one.");
  if (user.verified) return { ok: true, email };
  if (ctx.now() > row.expiresAt) return fail(400, "That code has expired. Ask for a new one.");
  if (row.attempts >= MAX_CODE_ATTEMPTS) return fail(429, "Too many wrong codes. Ask for a new code.");
  if (!safeEqual(row.codeHash, sha256(`${user.id}:${code}`))) {
    await ctx.repo.bumpCodeAttempts(user.id);
    return fail(400, "That code is not correct.");
  }
  await ctx.repo.updateUser(user.id, { verified: true });
  await ctx.repo.deleteCode(user.id);
  return { ok: true, email };
}

let dummyHash: string | null = null;

export async function login(ctx: Ctx, raw: unknown): Promise<Res<{ token: string; user: PublicUser; maxAgeSeconds: number }>> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const email = normEmail(r.email);
  const password = typeof r.password === "string" ? r.password : "";
  const generic = fail(401, "Wrong email or password.");
  if (!email || !password || password.length > 128) return generic;
  const user = await ctx.repo.findUserByEmail(email);
  if (!user) {
    dummyHash ??= hashPassword("not-a-real-password-1");
    verifyPassword(password, dummyHash); // same work as a real check
    return generic;
  }
  const now = ctx.now();
  if (user.lockedUntil > now) return fail(429, `Too many wrong passwords. Try again in ${Math.ceil((user.lockedUntil - now) / 60000)} minute(s).`);
  if (!verifyPassword(password, user.passwordHash)) {
    const failed = user.failedLogins + 1;
    await ctx.repo.updateUser(user.id, failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: now + LOCK_MINUTES * 60_000 } : { failedLogins: failed });
    return generic;
  }
  if (user.disabled) return fail(403, "This account has been disabled. Contact the site owner.");
  if (!user.verified) {
    const err = await sendCode(ctx, user, false);
    if (err && err.status !== 429) return err;
    return fail(403, "Please verify your email first. We sent a new code to your email.", { needsVerification: true, email });
  }
  await ctx.repo.updateUser(user.id, { failedLogins: 0, lockedUntil: 0, lastLogin: now });
  const token = randomToken();
  const maxAgeSeconds = SESSION_DAYS * 86400;
  await ctx.repo.createSession(sha256(token), user.id, now + maxAgeSeconds * 1000);
  return { ok: true, token, user: toPublic(user), maxAgeSeconds };
}

export async function userFromToken(ctx: Ctx, token: string | null): Promise<UserRow | null> {
  if (!token) return null;
  const h = sha256(token);
  const s = await ctx.repo.getSession(h);
  if (!s) return null;
  if (s.expiresAt < ctx.now()) {
    await ctx.repo.deleteSession(h);
    return null;
  }
  const u = await ctx.repo.findUserById(s.userId);
  return u && u.verified && !u.disabled ? u : null;
}

export async function logout(ctx: Ctx, token: string | null): Promise<void> {
  if (token) await ctx.repo.deleteSession(sha256(token));
}
