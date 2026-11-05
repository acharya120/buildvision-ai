import { connectMail, disconnectMail } from "@/server/admin";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const PUT = route({ auth: "admin" }, async (ctx, req) => {
  const r = await connectMail(ctx, await readJson(req));
  return r.ok ? json({ ok: true, user: r.user }) : jsonError(r.status, r.error);
});

export const DELETE = route({ auth: "admin" }, async (ctx) => json(await disconnectMail(ctx)));
