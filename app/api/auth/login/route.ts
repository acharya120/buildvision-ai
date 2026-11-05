import { login } from "@/server/auth";
import { json, jsonError, readJson, route, sessionCookie } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route({}, async (ctx, req) => {
  const r = await login(ctx, await readJson(req));
  if (!r.ok) return jsonError(r.status, r.error, r.needsVerification ? { needsVerification: true, email: r.email } : undefined);
  return json({ ok: true, user: r.user }, 200, { "set-cookie": sessionCookie(r.token, r.maxAgeSeconds) });
});
