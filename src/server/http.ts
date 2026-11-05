import { userFromToken, type Ctx } from "./auth";
import { readEnv } from "./env";
import { createMailer } from "./mail";
import type { UserRow } from "./repo";

export const COOKIE = "bv_session";
let cached: Ctx | null | undefined;

/** Lets tests plug in a fake database and mailer. Not used in production. */
export function setCtxForTests(c: Ctx | null): void {
  cached = c;
}

/** null when DATABASE_URL is not set: the app then keeps working without accounts. */
export async function getCtx(): Promise<Ctx | null> {
  if (cached !== undefined) return cached;
  const env = readEnv();
  if (!env.DATABASE_URL) return (cached = null);
  const { createNeonRepo } = await import("./neonRepo");
  const repo = createNeonRepo(env.DATABASE_URL);
  cached = { repo, mailer: createMailer(repo, env), env, now: () => Date.now() };
  return cached;
}

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}
export const jsonError = (status: number, error: string, extra?: Record<string, unknown>) => json({ error, ...extra }, status);

export function getToken(req: Request): string | null {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
export const clearCookie = (): string => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** Blocks cross-site POST/PUT/DELETE: the Origin header, when present, must be this site. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.length > 3_000_000) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type Handler = (ctx: Ctx, req: Request, user: UserRow | null) => Promise<Response>;

/** Wraps a route: database check, same-origin check for writes, optional login / admin requirement, and safe errors. */
export function route(opts: { auth?: "user" | "admin" | "none" }, handler: Handler) {
  return async (req: Request): Promise<Response> => {
    try {
      const ctx = await getCtx();
      if (!ctx) return jsonError(503, "The database is not connected yet.", { notConfigured: true });
      if (req.method !== "GET" && !sameOrigin(req)) return jsonError(403, "Blocked: the request did not come from this site.");
      let user: UserRow | null = null;
      if (opts.auth && opts.auth !== "none") {
        user = await userFromToken(ctx, getToken(req));
        if (!user) return jsonError(401, "Please log in.");
        if (opts.auth === "admin" && user.role !== "admin") return jsonError(403, "Only the admin can do this.");
      }
      return await handler(ctx, req, user);
    } catch (e) {
      console.error("API error", e instanceof Error ? e.message : e);
      return jsonError(500, "Something went wrong on the server. Check the database connection and try again.");
    }
  };
}
