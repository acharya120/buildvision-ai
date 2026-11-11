import { runAiReview } from "@/server/aiReview";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route({ auth: "user" }, async (ctx, req, user) => {
  const r = await runAiReview(ctx, user!, await readJson(req));
  return r.ok ? json(r) : jsonError(r.status, r.error);
});
