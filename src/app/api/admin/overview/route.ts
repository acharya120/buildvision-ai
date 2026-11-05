import { adminOverview } from "@/server/admin";
import { json, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, async (ctx) => json(await adminOverview(ctx)));
