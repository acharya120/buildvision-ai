import { getCtx, json } from "@/server/http";
import { getGeneral } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contact details the owner may have changed in the Settings panel. Nothing private. */
export async function GET(): Promise<Response> {
  try {
    const ctx = await getCtx();
    if (!ctx) return json({ email: "", phone: "" });
    const g = await getGeneral(ctx.repo);
    return json({ email: g.contactEmail, phone: g.contactPhone });
  } catch {
    return json({ email: "", phone: "" });
  }
}
