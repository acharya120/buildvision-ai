import { parseProject } from "@/lib/model/schema";
import { parseBundle, MAX_BUNDLE_CHARS } from "@/lib/pm/bundle";
import { DATA_SECTIONS, MEMBER_ROLES, can, canManage, isDataSection, isMemberRole, type AccessRole, type Section } from "@/lib/pm/roles";
import type { UserRow } from "../repo";
import type { PmRepo } from "./repo";

export interface BlobStore { put(pathname: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>; del(url: string): Promise<void> }
export interface PmCtx { pm: PmRepo; blob: BlobStore | null; now: () => number; fetchFile?: (url: string) => Promise<Response> }
export type Fail = { ok: false; status: number; error: string; conflict?: { current: number } };
export type Ok<T> = { ok: true } & T;
type Res<T> = Ok<T> | Fail;
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const MAX_MEMBERS = 20;
export const MAX_DATA_CHARS = 1_200_000;
export const MAX_BACKUPS = 20;
export const MAX_FILE_BYTES = 4_000_000;
export const MAX_FILES = 200;
export const FILE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", csv: "text/csv", txt: "text/plain", ifc: "text/plain", dxf: "text/plain", xyz: "text/plain", pts: "text/plain" };
const INLINE = new Set(["image/jpeg", "image/png", "image/webp"]);
export const emailKey = (e: string) => e.trim().toLowerCase();

/** The caller's role on a project, or null. Only an existing project can be accessed. Members are matched by the verified e-mail of the logged-in user. */
export async function roleOn(c: PmCtx, user: UserRow, ownerId: string, projectId: string): Promise<AccessRole | null> {
  if (!ID.test(ownerId) || !ID.test(projectId)) return null;
  if (!(await c.pm.projectMeta(ownerId, projectId))) return null;
  if (user.id === ownerId) return "owner";
  const m = await c.pm.getMember(ownerId, projectId, emailKey(user.email));
  return m ? m.role : null;
}
const audit = (c: PmCtx, user: UserRow, ownerId: string, projectId: string, action: string, detail = "") =>
  c.pm.addAudit({ at: c.now(), ownerId, projectId, actor: user.email, action, detail: detail.slice(0, 200) });

async function need(c: PmCtx, user: UserRow, ownerId: string, projectId: string, section: Section | "manage", perm: "r" | "w"): Promise<Res<{ role: AccessRole }>> {
  const role = await roleOn(c, user, ownerId, projectId);
  // not found and not allowed look the same, so project ids cannot be probed
  if (!role) return fail(404, "Project not found, or you do not have access to it.");
  const allowed = section === "manage" ? canManage(role) : can(role, section, perm);
  if (!allowed) return fail(403, "Your role does not allow this.");
  return { ok: true, role };
}

// ------------------------------------------------------------------ sharing
export async function listShared(c: PmCtx, user: UserRow) {
  const rows = await c.pm.listSharedWith(emailKey(user.email));
  const out: Array<{ ownerId: string; projectId: string; name: string; role: string; updatedAt: string }> = [];
  for (const m of rows) { const meta = await c.pm.projectMeta(m.ownerId, m.projectId); if (meta) out.push({ ownerId: m.ownerId, projectId: m.projectId, name: meta.name, role: m.role, updatedAt: meta.updatedAt }); }
  return out;
}
export async function listMembers(c: PmCtx, user: UserRow, ownerId: string, projectId: string): Promise<Res<{ members: Array<{ email: string; role: string; createdAt: number }> }>> {
  const a = await need(c, user, ownerId, projectId, "manage", "r");
  if (!a.ok) return a;
  return { ok: true, members: (await c.pm.listMembers(ownerId, projectId)).map((m) => ({ email: m.email, role: m.role, createdAt: m.createdAt })) };
}
export async function addMember(c: PmCtx, user: UserRow, raw: unknown): Promise<Res<object>> {
  const b = raw as { projectId?: unknown; email?: unknown; role?: unknown } | null;
  const projectId = typeof b?.projectId === "string" ? b.projectId : "", email = typeof b?.email === "string" ? emailKey(b.email) : "";
  if (!EMAIL.test(email)) return fail(400, "Enter a valid e-mail address.");
  if (!isMemberRole(b?.role)) return fail(400, `Role must be one of: ${MEMBER_ROLES.join(", ")}.`);
  const a = await need(c, user, user.id, projectId, "manage", "w");
  if (!a.ok) return a;
  if (email === emailKey(user.email)) return fail(400, "You already own this project.");
  const list = await c.pm.listMembers(user.id, projectId);
  if (!list.some((m) => m.email === email) && list.length >= MAX_MEMBERS) return fail(400, `A project can have at most ${MAX_MEMBERS} members.`);
  await c.pm.upsertMember({ ownerId: user.id, projectId, email, role: b.role, createdAt: c.now(), invitedBy: user.email });
  await audit(c, user, user.id, projectId, "member.set", `${email} as ${b.role}`);
  return { ok: true };
}
export async function removeMember(c: PmCtx, user: UserRow, projectId: string, email: string): Promise<Res<object>> {
  const a = await need(c, user, user.id, projectId, "manage", "w");
  if (!a.ok) return a;
  await c.pm.deleteMember(user.id, projectId, emailKey(email));
  await audit(c, user, user.id, projectId, "member.remove", emailKey(email));
  return { ok: true };
}

// ------------------------------------------------------------------ shared project (design)
export async function getSharedProject(c: PmCtx, user: UserRow, ownerId: string, projectId: string): Promise<Res<{ data: string; role: AccessRole }>> {
  const a = await need(c, user, ownerId, projectId, "design", "r");
  if (!a.ok) return a;
  const data = await c.pm.projectData(ownerId, projectId);
  return data ? { ok: true, data, role: a.role } : fail(404, "Project not found, or you do not have access to it.");
}
/** Architect or owner replaces the shared project with their version. The project is validated exactly like an import. */
export async function publishProject(c: PmCtx, user: UserRow, raw: unknown): Promise<Res<object>> {
  const b = raw as { ownerId?: unknown; projectId?: unknown; project?: unknown } | null;
  const ownerId = typeof b?.ownerId === "string" ? b.ownerId : "", projectId = typeof b?.projectId === "string" ? b.projectId : "";
  const a = await need(c, user, ownerId, projectId, "design", "w");
  if (!a.ok) return a;
  const parsed = parseProject(b?.project);
  if (!parsed.ok) return fail(400, "That project is not valid: " + parsed.errors[0]);
  if (parsed.project.id !== projectId) return fail(400, "The project id does not match the shared project.");
  const data = JSON.stringify(parsed.project);
  if (data.length > 2_000_000) return fail(413, "The project is too large to store (2 MB limit).");
  await c.pm.saveProjectData(ownerId, projectId, parsed.project.name.slice(0, 120), data, parsed.project.updatedAt);
  await audit(c, user, ownerId, projectId, "design.publish", `${a.role}`);
  return { ok: true };
}

// ------------------------------------------------------------------ central data
export async function getData(c: PmCtx, user: UserRow, ownerId: string, projectId: string, section: string): Promise<Res<{ value: string | null; version: number; updatedAt: number; updatedBy: string }>> {
  if (!isDataSection(section)) return fail(400, "Unknown section.");
  const a = await need(c, user, ownerId, projectId, section, "r");
  if (!a.ok) return a;
  const r = await c.pm.getData(ownerId, projectId, section);
  return { ok: true, value: r?.value ?? null, version: r?.version ?? 0, updatedAt: r?.updatedAt ?? 0, updatedBy: r?.updatedBy ?? "" };
}
export async function putData(c: PmCtx, user: UserRow, raw: unknown): Promise<Res<{ version: number }>> {
  const b = raw as { ownerId?: unknown; projectId?: unknown; section?: unknown; value?: unknown; expectedVersion?: unknown } | null;
  const ownerId = typeof b?.ownerId === "string" ? b.ownerId : "", projectId = typeof b?.projectId === "string" ? b.projectId : "";
  if (!isDataSection(b?.section)) return fail(400, "Unknown section.");
  if (typeof b?.value !== "string" || b.value.length > MAX_DATA_CHARS) return fail(400, "The data is missing or too large.");
  try { JSON.parse(b.value); } catch { return fail(400, "The data is not valid JSON."); }
  const exp = b?.expectedVersion;
  if (typeof exp !== "number" || !Number.isInteger(exp) || exp < 0) return fail(400, "expectedVersion must be a whole number (0 for the first save).");
  const a = await need(c, user, ownerId, projectId, b.section, "w");
  if (!a.ok) return a;
  const r = await c.pm.putData({ ownerId, projectId, section: b.section, value: b.value, updatedAt: c.now(), updatedBy: user.email }, exp);
  if (!r.ok) return { ...fail(409, "Someone else saved a newer version. Download theirs first, then decide what to keep."), conflict: { current: r.current } };
  await audit(c, user, ownerId, projectId, "data.put", `${b.section} v${r.version}`);
  return { ok: true, version: r.version };
}
export const SYNC_SECTIONS = DATA_SECTIONS;

// ------------------------------------------------------------------ backups (owner only)
export async function createBackup(c: PmCtx, user: UserRow, raw: unknown): Promise<Res<{ id: string }>> {
  const b = raw as { projectId?: unknown; label?: unknown; bundle?: unknown } | null;
  const projectId = typeof b?.projectId === "string" ? b.projectId : "";
  const a = await need(c, user, user.id, projectId, "manage", "w");
  if (!a.ok) return a;
  if (typeof b?.bundle !== "string" || b.bundle.length > MAX_BUNDLE_CHARS) return fail(413, "The backup is too large for server storage (3.5 MB). Use the file backup instead.");
  const parsed = parseBundle(b.bundle, MAX_BUNDLE_CHARS);
  if (!parsed.ok) return fail(400, parsed.error);
  if (parsed.project.id !== projectId) return fail(400, "The backup is for a different project.");
  const id = `bk_${c.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const label = (typeof b.label === "string" ? b.label : "").trim().slice(0, 80) || new Date(c.now()).toISOString().slice(0, 16).replace("T", " ");
  await c.pm.addBackup({ id, ownerId: user.id, projectId, label, createdAt: c.now(), size: b.bundle.length, data: b.bundle });
  await c.pm.pruneBackups(user.id, projectId, MAX_BACKUPS);
  await audit(c, user, user.id, projectId, "backup.create", label);
  return { ok: true, id };
}
export async function listBackups(c: PmCtx, user: UserRow, projectId: string) {
  const a = await need(c, user, user.id, projectId, "manage", "r");
  return a.ok ? ({ ok: true, backups: await c.pm.listBackups(user.id, projectId) } as Ok<{ backups: Awaited<ReturnType<PmRepo["listBackups"]>> }>) : a;
}
export async function getBackup(c: PmCtx, user: UserRow, id: string): Promise<Res<{ data: string; projectId: string }>> {
  if (!ID.test(id)) return fail(400, "Invalid backup id.");
  const b = await c.pm.getBackup(user.id, id); // only the caller's own backups can match
  if (!b) return fail(404, "Backup not found.");
  await audit(c, user, user.id, b.projectId, "backup.download", b.label);
  return { ok: true, data: b.data, projectId: b.projectId };
}
export async function deleteBackup(c: PmCtx, user: UserRow, id: string): Promise<Res<object>> {
  if (!ID.test(id)) return fail(400, "Invalid backup id.");
  const b = await c.pm.getBackup(user.id, id);
  if (!b) return fail(404, "Backup not found.");
  await c.pm.deleteBackup(user.id, id);
  await audit(c, user, user.id, b.projectId, "backup.delete", b.label);
  return { ok: true };
}

// ------------------------------------------------------------------ files (Blob storage)
export const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".").trim().slice(0, 80) || "file";
export async function uploadFile(c: PmCtx, user: UserRow, a: { ownerId: string; projectId: string; name: string; bytes: Uint8Array }): Promise<Res<{ id: string }>> {
  const g = await need(c, user, a.ownerId, a.projectId, "files", "w");
  if (!g.ok) return g;
  if (!c.blob) return fail(503, "File storage is not set up. Create a Blob store in Vercel and add BLOB_READ_WRITE_TOKEN.");
  const name = safeName(a.name), ext = (name.split(".").pop() ?? "").toLowerCase();
  const mime = FILE_TYPES[ext];
  if (!mime) return fail(400, `That file type is not allowed. Allowed: ${Object.keys(FILE_TYPES).join(", ")}.`);
  if (a.bytes.length === 0) return fail(400, "The file is empty.");
  if (a.bytes.length > MAX_FILE_BYTES) return fail(413, "Files up to 4 MB can be uploaded here (a hosting limit). Reduce the size or split the file.");
  const sig = a.bytes;
  const okSig = ext === "png" ? sig[0] === 0x89 && sig[1] === 0x50 : ext === "jpg" || ext === "jpeg" ? sig[0] === 0xff && sig[1] === 0xd8 : ext === "pdf" ? sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46 : ext === "webp" ? sig[0] === 0x52 && sig[8] === 0x57 : true;
  if (!okSig) return fail(400, "The file content does not match its extension.");
  if ((await c.pm.listFiles(a.ownerId, a.projectId)).length >= MAX_FILES) return fail(400, `A project can hold at most ${MAX_FILES} files.`);
  const id = `fl_${c.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const put = await c.blob.put(`bv/${a.ownerId}/${a.projectId}/${id}-${name}`, a.bytes, mime);
  await c.pm.addFile({ id, ownerId: a.ownerId, projectId: a.projectId, name, mime, size: a.bytes.length, url: put.url, uploadedBy: user.email, uploadedById: user.id, createdAt: c.now() });
  await audit(c, user, a.ownerId, a.projectId, "file.upload", name);
  return { ok: true, id };
}
export async function listFiles(c: PmCtx, user: UserRow, ownerId: string, projectId: string) {
  const a = await need(c, user, ownerId, projectId, "files", "r");
  if (!a.ok) return a;
  return { ok: true, files: (await c.pm.listFiles(ownerId, projectId)).map(({ url: _u, ...f }) => { void _u; return f; }) } as Ok<{ files: Array<Omit<import("./repo").FileRow, "url">> }>;
}
/** Streams a file through the server, so the storage address is never given out and every download is permission-checked. */
export async function downloadFile(c: PmCtx, user: UserRow, id: string): Promise<Response> {
  const f = ID.test(id) ? await c.pm.getFile(id) : null;
  const a = f ? await need(c, user, f.ownerId, f.projectId, "files", "r") : null;
  if (!f || !a || !a.ok) return new Response(JSON.stringify({ error: "File not found, or you do not have access to it." }), { status: 404, headers: { "content-type": "application/json" } });
  const up = await (c.fetchFile ?? fetch)(f.url);
  if (!up.ok || !up.body) return new Response(JSON.stringify({ error: "The file could not be read from storage." }), { status: 502, headers: { "content-type": "application/json" } });
  const inline = INLINE.has(f.mime);
  return new Response(up.body, { headers: { "content-type": f.mime, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${f.name.replace(/"/g, "")}"`, "x-content-type-options": "nosniff", "cache-control": "private, no-store", "content-security-policy": "default-src 'none'; sandbox" } });
}
export async function deleteFile(c: PmCtx, user: UserRow, id: string): Promise<Res<object>> {
  const f = ID.test(id) ? await c.pm.getFile(id) : null;
  if (!f) return fail(404, "File not found.");
  const a = await need(c, user, f.ownerId, f.projectId, "files", "w");
  if (!a.ok) return a;
  if (a.role !== "owner" && f.uploadedById !== user.id) return fail(403, "Only the owner or the person who uploaded a file can delete it.");
  if (c.blob) await c.blob.del(f.url);
  await c.pm.deleteFile(id);
  await audit(c, user, f.ownerId, f.projectId, "file.delete", f.name);
  return { ok: true };
}

// ------------------------------------------------------------------ activity (owner only)
export async function listActivity(c: PmCtx, user: UserRow, projectId: string) {
  const a = await need(c, user, user.id, projectId, "manage", "r");
  return a.ok ? ({ ok: true, entries: await c.pm.listAudit(user.id, projectId, 100) } as Ok<{ entries: Awaited<ReturnType<PmRepo["listAudit"]>> }>) : a;
}
