import { listUsers, userAction } from "@/server/admin";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, async (ctx) => json({ users: await listUsers(ctx) }));

export const POST = route({ auth: "admin" }, async (ctx, req, user) => {
  const r = await userAction(ctx, user!.id, await readJson(req));
  return r.ok ? json({ ok: true }) : jsonError(r.status, r.error);
});
