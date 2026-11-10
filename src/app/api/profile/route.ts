import { completeness, getProfile, saveProfile } from "@/server/profile";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async (ctx, _req, user) => {
  const profile = await getProfile(ctx, user!);
  return json({ profile, complete: completeness(profile), saved: profile.updatedAt > 0 });
});
export const PUT = route({ auth: "user" }, async (ctx, req, user) => {
  const r = await saveProfile(ctx, user!, await readJson(req));
  return r.ok ? json({ profile: r.profile, complete: completeness(r.profile), saved: true }) : jsonError(r.status, r.error);
});
