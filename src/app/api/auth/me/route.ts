import { toPublic, userFromToken } from "@/server/auth";
import { getCtx, getToken, json } from "@/server/http";
import { getGeneral } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the page whether accounts are switched on (database connected) and who is logged in. */
export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await getCtx();
    if (!ctx) return json({ configured: false, user: null });
    const u = await userFromToken(ctx, getToken(req));
    const g = await getGeneral(ctx.repo);
    return json({ configured: true, user: u ? toPublic(u) : null, allowRegistration: g.allowRegistration, contact: { email: g.contactEmail, phone: g.contactPhone } });
  } catch (e) {
    console.error("me error", e instanceof Error ? e.message : e);
    return json({ configured: true, user: null, error: "The database could not be reached." }, 200);
  }
}
