import { userFromToken } from "@/server/auth";
import { getCtx, getToken, json, jsonError, route } from "@/server/http";
import { handlePm } from "@/server/pm/handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ path: string[] }> };

/** GET /api/pm/status works without login or database so the screens can explain what is missing. */
async function status(req: Request): Promise<Response> {
  const ctx = await getCtx();
  if (!ctx) return json({ dbConnected: false, loggedIn: false, blob: false });
  const user = await userFromToken(ctx, getToken(req));
  return json({ dbConnected: true, loggedIn: !!user, email: user?.email ?? null, userId: user?.id ?? null, blob: !!ctx.env.BLOB_READ_WRITE_TOKEN });
}

async function dispatch(req: Request, { params }: Params): Promise<Response> {
  const { path } = await params;
  if (req.method === "GET" && path.length === 1 && path[0] === "status") {
    try { return await status(req); } catch { return jsonError(500, "Could not read the status."); }
  }
  return route({ auth: "user" }, (ctx, r, user) => handlePm(ctx, user!, r, path))(req);
}
export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
