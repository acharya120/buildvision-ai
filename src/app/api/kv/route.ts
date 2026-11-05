import { getKvValue, setKvValue } from "@/server/projects";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async (ctx, req, user) => json({ value: await getKvValue(ctx, user!.id, new URL(req.url).searchParams.get("key") ?? "") }));

export const PUT = route({ auth: "user" }, async (ctx, req, user) => {
  const b = (await readJson(req)) as { key?: unknown; value?: unknown } | null;
  const r = await setKvValue(ctx, user!.id, typeof b?.key === "string" ? b.key : "", b?.value);
  return r.ok ? json({ ok: true }) : jsonError(r.status, r.error);
});
