import { getBrand, saveBrand } from "@/server/brand";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, async (ctx) => json({ brand: await getBrand(ctx.repo) }));
export const PUT = route({ auth: "admin" }, async (ctx, req) => {
  const r = await saveBrand(ctx.repo, await readJson(req));
  return r.ok ? json({ brand: r.value }) : jsonError(400, r.error);
});
