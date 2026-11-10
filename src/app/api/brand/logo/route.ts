import { getCtx } from "@/server/http";
import { getBrand } from "@/server/brand";
import { checkImageDataUrl } from "@/server/images";
import { LOGO_MAX_CHARS } from "@/server/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The logo the owner uploaded. Public on purpose: emails and the login page show it. */
export async function GET(): Promise<Response> {
  try {
    const ctx = await getCtx();
    if (!ctx) return new Response("Not found", { status: 404 });
    const b = await getBrand(ctx.repo);
    const c = b.logo ? checkImageDataUrl(b.logo, LOGO_MAX_CHARS) : null;
    if (!c || !c.ok) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(c.bytes), {
      headers: { "content-type": c.mime, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
