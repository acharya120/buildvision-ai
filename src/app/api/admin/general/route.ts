import { updateGeneral } from "@/server/admin";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route({ auth: "admin" }, async (ctx, req) => {
  const r = await updateGeneral(ctx, await readJson(req));
  return r.ok ? json({ ok: true, general: r.value }) : jsonError(400, r.error);
});
