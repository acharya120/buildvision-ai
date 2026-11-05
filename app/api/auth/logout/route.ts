import { logout } from "@/server/auth";
import { clearCookie, getToken, json, route } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route({}, async (ctx, req) => {
  await logout(ctx, getToken(req));
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
});
