import { connectProvider, disconnectProvider, saveAiSettings } from "@/server/ai";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const PUT = route({ auth: "admin" }, async (ctx, req) => {
  const r = await connectProvider(ctx, await readJson(req));
  return r.ok ? json(r) : jsonError(r.status, r.error);
});
export const POST = route({ auth: "admin" }, async (ctx, req) => {
  const r = await saveAiSettings(ctx, await readJson(req));
  return r.ok ? json(r) : jsonError(r.status, r.error);
});
export const DELETE = route({ auth: "admin" }, async (ctx, req) => {
  const r = await disconnectProvider(ctx, await readJson(req));
  return r.ok ? json(r) : jsonError(r.status, r.error);
});
