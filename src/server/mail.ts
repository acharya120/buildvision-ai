import { decryptText, encryptText } from "./crypto";
import type { Repo } from "./repo";
import type { Env } from "./env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  source: "database" | "environment";
}
export interface Mailer {
  /** the account mails are sent from, or null when no mail app is connected */
  sender(): Promise<{ user: string; source: "database" | "environment" } | null>;
  send(msg: MailMessage): Promise<void>;
}

export interface StoredMail {
  host: string;
  port: number;
  user: string;
  passEnc: string;
  fromName: string;
}

/** Google shows app passwords as "abcd efgh ijkl mnop"; the spaces are not part of the password. */
export const cleanAppPassword = (v: string) => v.replace(/\s+/g, "");

export function buildStoredMail(input: { host: string; port: number; user: string; password: string; fromName: string }, secret: string): StoredMail {
  return { host: input.host.trim(), port: input.port, user: input.user.trim(), passEnc: encryptText(cleanAppPassword(input.password), secret), fromName: input.fromName.trim() };
}

export async function loadMailConfig(repo: Repo, env: Env): Promise<MailConfig | null> {
  const raw = await repo.getSetting("mail");
  if (raw && env.APP_SECRET) {
    try {
      const s = JSON.parse(raw) as StoredMail;
      const pass = decryptText(s.passEnc, env.APP_SECRET);
      if (pass && s.user) return { host: s.host, port: s.port, secure: s.port === 465, user: s.user, pass, fromName: s.fromName, source: "database" };
    } catch {
      /* fall through to environment */
    }
  }
  if (env.SMTP_USER && env.SMTP_PASS) {
    const port = Number(env.SMTP_PORT) || 465;
    return { host: env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, user: env.SMTP_USER, pass: cleanAppPassword(env.SMTP_PASS), fromName: env.SMTP_FROM_NAME || "BuildVision AI", source: "environment" };
  }
  return null;
}

async function transport(cfg: MailConfig) {
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/** Checks that the host accepts the login. Throws with a readable message when it does not. */
export async function verifyMailConfig(cfg: MailConfig): Promise<void> {
  try {
    await (await transport(cfg)).verify();
  } catch (e) {
    throw new Error(friendlyMailError(e));
  }
}

export async function sendWithConfig(cfg: MailConfig, msg: MailMessage): Promise<void> {
  try {
    await (await transport(cfg)).sendMail({ from: `"${cfg.fromName.replace(/"/g, "")}" <${cfg.user}>`, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  } catch (e) {
    throw new Error(friendlyMailError(e));
  }
}

/** Never includes the password. Gives the beginner a next step for the usual Gmail problems. */
export function friendlyMailError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code;
  if (code === "EAUTH" || /Invalid login|Username and Password not accepted|535/i.test(m)) return "The mail server refused the login. For Gmail, use a 16 character App Password (not your normal password) and turn on 2-Step Verification first.";
  if (code === "ESOCKET" || code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ENOTFOUND") return "Could not reach the mail server. Check the host and port (Gmail: smtp.gmail.com, port 465).";
  return "The mail server reported a problem: " + m.slice(0, 160);
}

export function createMailer(repo: Repo, env: Env): Mailer {
  return {
    async sender() {
      const c = await loadMailConfig(repo, env);
      return c ? { user: c.user, source: c.source } : null;
    },
    async send(msg) {
      const c = await loadMailConfig(repo, env);
      if (!c) throw new Error("Email sending is not set up yet.");
      await sendWithConfig(c, msg);
    },
  };
}
