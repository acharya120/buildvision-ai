import { sendTestMail } from "@/server/admin";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = route({ auth: "admin" }, async (ctx, req, user) => {
  const b = (await readJson(req)) as { to?: unknown } | null;
  const to = typeof b?.to === "string" && b.to.trim() ? b.to.trim() : user!.email;
  const r = await sendTestMail(ctx, to);
  return r.ok ? json(r) : jsonError(r.status, r.error);
});
