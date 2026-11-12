import type { Ctx } from "../auth";
import { json, jsonError } from "../http";
import type { UserRow } from "../repo";
import { getPm } from "./ctx";
import * as S from "./service";

const MAX_BODY = 4_300_000;
async function readBody(req: Request): Promise<{ text: string } | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return null;
  const text = await req.text();
  return text.length > MAX_BODY ? null : { text };
}
async function readJsonBody(req: Request): Promise<unknown> {
  const b = await readBody(req);
  if (!b) return null;
  try { return JSON.parse(b.text); } catch { return null; }
}
const out = (r: S.Fail | ({ ok: true } & object)) => {
  if (r.ok) { const { ok: _ok, ...rest } = r as { ok: true } & Record<string, unknown>; void _ok; return json({ ok: true, ...rest }); }
  return jsonError(r.status, r.error, r.conflict ? { conflict: r.conflict } : undefined);
};

/** Dispatches /api/pm/<segments>. Every endpoint needs a logged-in, verified user; the role checks are in service.ts. */
export async function handlePm(ctx: Ctx, user: UserRow, req: Request, segs: string[]): Promise<Response> {
  const c = await getPm(ctx);
  const url = new URL(req.url), qs = url.searchParams, m = req.method, name = segs[0] ?? "";
  const owner = qs.get("owner") ?? "", project = qs.get("project") ?? "", id = qs.get("id") ?? "";
  if (segs.length !== 1) return jsonError(404, "Not found.");
  switch (`${m} ${name}`) {
    case "GET shared": return json({ projects: await S.listShared(c, user) });
    case "GET members": return out(await S.listMembers(c, user, user.id, project));
    case "POST members": return out(await S.addMember(c, user, await readJsonBody(req)));
    case "DELETE members": return out(await S.removeMember(c, user, project, qs.get("email") ?? ""));
    case "GET project": return out(await S.getSharedProject(c, user, owner, project));
    case "PUT project": return out(await S.publishProject(c, user, await readJsonBody(req)));
    case "GET data": return out(await S.getData(c, user, owner, project, qs.get("section") ?? ""));
    case "PUT data": return out(await S.putData(c, user, await readJsonBody(req)));
    case "GET backups": return out(await S.listBackups(c, user, project));
    case "POST backups": return out(await S.createBackup(c, user, await readJsonBody(req)));
    case "GET backup": return out(await S.getBackup(c, user, id));
    case "DELETE backup": return out(await S.deleteBackup(c, user, id));
    case "GET files": return out(await S.listFiles(c, user, owner, project));
    case "POST file": {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > S.MAX_FILE_BYTES + 2000) return jsonError(413, "Files up to 4 MB can be uploaded here (a hosting limit).");
      const buf = new Uint8Array(await req.arrayBuffer());
      return out(await S.uploadFile(c, user, { ownerId: owner, projectId: project, name: qs.get("name") ?? "", bytes: buf }));
    }
    case "GET file": return S.downloadFile(c, user, id);
    case "DELETE file": return out(await S.deleteFile(c, user, id));
    case "GET activity": return out(await S.listActivity(c, user, project));
    default: return jsonError(404, "Not found.");
  }
}
