import { deleteCloudProject, listCloudProjects, saveCloudProject } from "@/server/projects";
import { json, jsonError, readJson, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, async (ctx, _req, user) => json({ projects: await listCloudProjects(ctx, user!.id) }));

export const POST = route({ auth: "user" }, async (ctx, req, user) => {
  const r = await saveCloudProject(ctx, user!.id, await readJson(req));
  return r.ok ? json({ ok: true }) : jsonError(r.status, r.error);
});

export const DELETE = route({ auth: "user" }, async (ctx, req, user) => {
  const r = await deleteCloudProject(ctx, user!.id, new URL(req.url).searchParams.get("id") ?? "");
  return r.ok ? json({ ok: true }) : jsonError(r.status, r.error);
});
