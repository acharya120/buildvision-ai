import { resendCode } from "@/server/auth";
import { json, jsonError, readJson, route } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route({}, async (ctx, req) => {
  const r = await resendCode(ctx, await readJson(req));
  return r.ok ? json({ ok: true }) : jsonError(r.status, r.error);
});
