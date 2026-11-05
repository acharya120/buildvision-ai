import { aiPublicStatus } from "@/server/ai";
import { json, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async (ctx) => json(await aiPublicStatus(ctx)));
