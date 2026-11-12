import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/server/memoryRepo";
import { MemoryPmRepo } from "@/server/pm/memory";
import * as S from "@/server/pm/service";
import { handlePm } from "@/server/pm/handle";
import { setPmForTests } from "@/server/pm/ctx";
import type { Ctx } from "@/server/auth";
import type { UserRow } from "@/server/repo";
import { MATRIX, SECTIONS, MEMBER_ROLES, can, canManage, isDataSection } from "@/lib/pm/roles";
import { buildBundle, parseBundle, restorePlan } from "@/lib/pm/bundle";
import { SAMPLES } from "@/lib/model/samples";
import type { Project } from "@/lib/model/types";

const user = (id: string, email: string): UserRow => ({ id, name: id, email, phone: "123456789", passwordHash: "x", role: "user", verified: true, disabled: false, failedLogins: 0, lockedUntil: 0, createdAt: 1, lastLogin: 0 });
const sample = (): Project => { const s: any = SAMPLES[0]; return (s.build ?? s.project ?? s.make)(); };
function setup() {
  const repo = new MemoryRepo(), pm = new MemoryPmRepo(repo);
  let t = 5_000_000;
  const blobs = new Map<string, Uint8Array>(), deleted: string[] = [];
  const blob = { put: async (p: string, b: Uint8Array) => { const url = `https://blob.test/${p}`; blobs.set(url, b); return { url }; }, del: async (u: string) => { deleted.push(u); blobs.delete(u); } };
  const c: S.PmCtx = { pm, blob, now: () => (t += 1000), fetchFile: async (u) => (blobs.has(u) ? new Response(blobs.get(u) as BodyInit) : new Response("no", { status: 404 })) };
  const owner = user("own1", "owner@x.com"), arch = user("arc1", "Arch@X.com"), eng = user("eng1", "eng@x.com"), con = user("con1", "con@x.com"), cli = user("cli1", "cli@x.com"), out = user("out1", "out@x.com");
  const p = sample();
  void repo.upsertProject(owner.id, { id: p.id, name: p.name, data: JSON.stringify(p), updatedAt: p.updatedAt });
  const q = { ...sample(), id: "otherproj", name: "Second" };
  void repo.upsertProject(owner.id, { id: q.id, name: q.name, data: JSON.stringify(q), updatedAt: q.updatedAt });
  return { repo, pm, c, blobs, deleted, owner, arch, eng, con, cli, out, p, q };
}
async function team() {
  const x = setup();
  for (const [u, role] of [[x.arch, "architect"], [x.eng, "engineer"], [x.con, "contractor"], [x.cli, "client"]] as const) {
    const r = await S.addMember(x.c, x.owner, { projectId: x.p.id, email: u.email.toUpperCase(), role });
    expect(r.ok).toBe(true);
  }
  return x;
}
const status = (r: { ok: boolean }) => (r.ok ? 200 : (r as S.Fail).status);

describe("role matrix", () => {
  it("matches the documented permissions", () => {
    expect(SECTIONS.length).toBe(7);
    for (const s of SECTIONS) expect(MATRIX.owner[s]).toBe("rw");
    expect(can("client", "design", "w")).toBe(false);
    expect(can("client", "fin", "r")).toBe(true);
    expect(can("client", "proc", "r")).toBe(false);
    expect(can("contractor", "proc", "w")).toBe(true);
    expect(can("contractor", "fin", "r")).toBe(false);
    expect(can("engineer", "fin", "r")).toBe(false);
    expect(can("engineer", "qc", "w")).toBe(true);
    expect(can("architect", "design", "w")).toBe(true);
    expect(can("architect", "fin", "w")).toBe(false);
    expect(can(null, "design", "r")).toBe(false);
    expect(MEMBER_ROLES.some((r) => canManage(r))).toBe(false);
    expect(canManage("owner")).toBe(true);
    expect(isDataSection("fin")).toBe(true);
    expect(isDataSection("files")).toBe(false);
    expect(isDataSection("__proto__")).toBe(false);
  });
});

describe("project bundle", () => {
  it("round-trips and re-keys on restore without touching the original", () => {
    const p = sample();
    const b = buildBundle(p, { proc: JSON.stringify({ items: [1] }), fin: "{}" }, JSON.stringify([{ id: "s1", at: "x", label: "l", note: "", auto: false, project: p }]), new Date("2026-01-01"));
    const text = JSON.stringify(b);
    const r = parseBundle(text);
    if (!r.ok) throw new Error(r.error);
    const plan = restorePlan(r.bundle, r.project, "newid");
    expect(plan.project.id).toBe("newid");
    expect(plan.project.name).toContain("restored");
    expect(p.id).not.toBe("newid");
    expect(plan.stored.proc).toBe(JSON.stringify({ items: [1] }));
    expect(JSON.parse(plan.history as string)[0].project.id).toBe("newid");
  });
  it("rejects anything that is not a valid bundle", () => {
    const p = sample();
    expect(parseBundle("nope").ok).toBe(false);
    expect(parseBundle(JSON.stringify({ app: "other" })).ok).toBe(false);
    expect(parseBundle(JSON.stringify({ ...buildBundle(p, {}, null), project: { id: 1 } })).ok).toBe(false);
    expect(parseBundle(JSON.stringify({ ...buildBundle(p, { "bad key!": "{}" }, null) })).ok).toBe(false);
    expect(parseBundle(JSON.stringify({ ...buildBundle(p, { ok: "not json" }, null) })).ok).toBe(false);
    expect(parseBundle(JSON.stringify({ ...buildBundle(p, {}, "{}" ) })).ok).toBe(false);
    expect(parseBundle("x".repeat(100), 10).ok).toBe(false);
  });
});

describe("sharing", () => {
  it("only the owner manages members, with validation and a cap", async () => {
    const x = setup();
    expect(status(await S.addMember(x.c, x.owner, { projectId: x.p.id, email: "nope", role: "client" }))).toBe(400);
    expect(status(await S.addMember(x.c, x.owner, { projectId: x.p.id, email: "a@b.com", role: "admin" }))).toBe(400);
    expect(status(await S.addMember(x.c, x.owner, { projectId: x.p.id, email: "OWNER@x.com", role: "client" }))).toBe(400);
    expect(status(await S.addMember(x.c, x.owner, { projectId: "missing", email: "a@b.com", role: "client" }))).toBe(404);
    expect(status(await S.addMember(x.c, x.out, { projectId: x.p.id, email: "a@b.com", role: "client" }))).toBe(404);
    for (let i = 0; i < S.MAX_MEMBERS; i++) expect((await S.addMember(x.c, x.owner, { projectId: x.p.id, email: `m${i}@b.com`, role: "client" })).ok).toBe(true);
    expect(status(await S.addMember(x.c, x.owner, { projectId: x.p.id, email: "extra@b.com", role: "client" }))).toBe(400);
    expect((await S.addMember(x.c, x.owner, { projectId: x.p.id, email: "M0@b.com", role: "engineer" })).ok).toBe(true); // changing a role is allowed at the cap
    const l = await S.listMembers(x.c, x.owner, x.p.id);
    expect(l.ok && l.members.find((m) => m.email === "m0@b.com")?.role).toBe("engineer");
  });
  it("members match by e-mail regardless of case and see only the projects shared with them", async () => {
    const x = await team();
    const shared = await S.listShared(x.c, x.arch);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ projectId: x.p.id, role: "architect", ownerId: x.owner.id });
    expect(await S.listShared(x.c, x.out)).toEqual([]);
    expect(status(await S.getSharedProject(x.c, x.out, x.owner.id, x.p.id))).toBe(404);
    expect(status(await S.getSharedProject(x.c, x.arch, x.owner.id, "otherproj"))).toBe(404); // shared project A does not open project B
    const g = await S.getSharedProject(x.c, x.cli, x.owner.id, x.p.id);
    expect(g.ok && JSON.parse(g.data).id).toBe(x.p.id);
  });
  it("removing a member ends their access at once", async () => {
    const x = await team();
    expect((await S.getData(x.c, x.cli, x.owner.id, x.p.id, "fin")).ok).toBe(true);
    expect((await S.removeMember(x.c, x.owner, x.p.id, "CLI@x.com")).ok).toBe(true);
    expect(status(await S.getData(x.c, x.cli, x.owner.id, x.p.id, "fin"))).toBe(404);
    expect(status(await S.removeMember(x.c, x.arch, x.p.id, "eng@x.com"))).toBe(404);
  });
  it("hides a deleted project from shared lists", async () => {
    const x = await team();
    await x.repo.deleteProject(x.owner.id, x.p.id);
    expect(await S.listShared(x.c, x.arch)).toEqual([]);
    expect(status(await S.getData(x.c, x.arch, x.owner.id, x.p.id, "qc"))).toBe(404);
  });
});

describe("central data and roles", () => {
  it("enforces read and write per role", async () => {
    const x = await team();
    const put = (u: UserRow, section: string, v = 0) => S.putData(x.c, u, { ownerId: x.owner.id, projectId: x.p.id, section, value: "{}", expectedVersion: v });
    expect(status(await put(x.con, "proc"))).toBe(200);
    expect(status(await put(x.cli, "proc"))).toBe(403);
    expect(status(await put(x.eng, "fin"))).toBe(403);
    expect(status(await put(x.arch, "fin"))).toBe(403);
    expect(status(await put(x.owner, "fin"))).toBe(200);
    expect(status(await put(x.eng, "qc"))).toBe(200);
    expect(status(await put(x.cli, "qc"))).toBe(403);
    expect(status(await put(x.out, "qc"))).toBe(404);
    const get = (u: UserRow, s: string) => S.getData(x.c, u, x.owner.id, x.p.id, s);
    expect(status(await get(x.cli, "fin"))).toBe(200);
    expect(status(await get(x.con, "fin"))).toBe(403);
    expect(status(await get(x.cli, "proc"))).toBe(403);
    expect(status(await get(x.owner, "constructor"))).toBe(400);
  });
  it("detects conflicting saves instead of overwriting", async () => {
    const x = await team();
    const put = (u: UserRow, v: number, value = '{"a":1}') => S.putData(x.c, u, { ownerId: x.owner.id, projectId: x.p.id, section: "qc", value, expectedVersion: v });
    const a = await put(x.eng, 0);
    expect(a.ok && a.version).toBe(1);
    const stale = await put(x.con, 0);
    expect(stale.ok).toBe(false);
    expect((stale as S.Fail).status).toBe(409);
    expect((stale as S.Fail).conflict).toEqual({ current: 1 });
    const b = await put(x.con, 1, '{"a":2}');
    expect(b.ok && b.version).toBe(2);
    const g = await S.getData(x.c, x.cli, x.owner.id, x.p.id, "qc");
    expect(g.ok && g.value).toBe('{"a":2}');
    expect(g.ok && g.updatedBy).toBe("con@x.com");
  });
  it("validates what is stored", async () => {
    const x = await team();
    const base = { ownerId: x.owner.id, projectId: x.p.id, section: "qc", expectedVersion: 0 };
    expect(status(await S.putData(x.c, x.owner, { ...base, value: "{bad" }))).toBe(400);
    expect(status(await S.putData(x.c, x.owner, { ...base, value: 5 }))).toBe(400);
    expect(status(await S.putData(x.c, x.owner, { ...base, value: JSON.stringify("x".repeat(S.MAX_DATA_CHARS)) }))).toBe(400);
    expect(status(await S.putData(x.c, x.owner, { ...base, value: "{}", expectedVersion: -1 }))).toBe(400);
    expect(status(await S.putData(x.c, x.owner, { ...base, value: "{}", expectedVersion: 1.5 }))).toBe(400);
    expect(status(await S.putData(x.c, x.owner, { ...base, section: "files", value: "{}" }))).toBe(400);
    expect(status(await S.putData(x.c, x.owner, { ...base, projectId: "../x", value: "{}" }))).toBe(404);
  });
});

describe("publishing the design", () => {
  it("lets the architect and owner publish, validates, and refuses everyone else", async () => {
    const x = await team();
    const edited = { ...x.p, name: "Edited by architect" };
    const pub = (u: UserRow, project: unknown, projectId = x.p.id) => S.publishProject(x.c, u, { ownerId: x.owner.id, projectId, project });
    expect(status(await pub(x.arch, edited))).toBe(200);
    expect(JSON.parse((await x.repo.listProjects(x.owner.id)).find((r) => r.id === x.p.id)!.data).name).toBe("Edited by architect");
    expect(status(await pub(x.cli, edited))).toBe(403);
    expect(status(await pub(x.eng, edited))).toBe(403);
    expect(status(await pub(x.out, edited))).toBe(404);
    expect(status(await pub(x.arch, { ...edited, id: "different" }))).toBe(400);
    expect(status(await pub(x.arch, { junk: true }))).toBe(400);
    expect(status(await pub(x.owner, edited))).toBe(200);
  });
});

describe("server backups", () => {
  it("are owner-only, validated, scoped to their owner, and pruned", async () => {
    const x = await team();
    const bundle = JSON.stringify(buildBundle(x.p, { proc: "{}" }, null));
    const mk = (u: UserRow, b = bundle, projectId = x.p.id) => S.createBackup(x.c, u, { projectId, label: "before change", bundle: b });
    const a = await mk(x.owner);
    expect(a.ok).toBe(true);
    expect(status(await mk(x.arch))).toBe(404);
    expect(status(await mk(x.owner, "junk"))).toBe(400);
    expect(status(await mk(x.owner, JSON.stringify(buildBundle(x.q, {}, null))))).toBe(400); // bundle is for another project
    expect(status(await mk(x.owner, "x".repeat(3_600_000)))).toBe(413);
    const id = (a as { ok: true; id: string }).id;
    const g = await S.getBackup(x.c, x.owner, id);
    expect(g.ok && parseBundle(g.data).ok).toBe(true);
    expect(status(await S.getBackup(x.c, x.arch, id))).toBe(404);
    expect(status(await S.deleteBackup(x.c, x.arch, id))).toBe(404);
    for (let i = 0; i < 25; i++) await mk(x.owner);
    const l = await S.listBackups(x.c, x.owner, x.p.id);
    expect(l.ok && l.backups.length).toBe(S.MAX_BACKUPS);
    expect(l.ok && "data" in l.backups[0]).toBe(false);
    expect(status(await S.listBackups(x.c, x.cli, x.p.id))).toBe(404);
    expect((await S.deleteBackup(x.c, x.owner, (l as any).backups[0].id)).ok).toBe(true);
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
describe("files", () => {
  it("accepts allowed types by role, checks content and size, and never exposes the storage address", async () => {
    const x = await team();
    const up = (u: UserRow, name: string, bytes: Uint8Array = PNG) => S.uploadFile(x.c, u, { ownerId: x.owner.id, projectId: x.p.id, name, bytes });
    const ok = await up(x.con, "site photo.png");
    expect(ok.ok).toBe(true);
    expect(status(await up(x.cli, "a.png"))).toBe(403);
    expect(status(await up(x.out, "a.png"))).toBe(404);
    expect(status(await up(x.con, "run.exe"))).toBe(400);
    expect(status(await up(x.con, "fake.png", new Uint8Array([1, 2, 3, 4])))).toBe(400);
    expect(status(await up(x.con, "empty.png", new Uint8Array()))).toBe(400);
    expect(status(await up(x.con, "big.csv", new Uint8Array(S.MAX_FILE_BYTES + 1)))).toBe(413);
    expect(S.safeName("../../etc/passwd")).not.toContain("/");
    const l = await S.listFiles(x.c, x.cli, x.owner.id, x.p.id);
    expect(l.ok && l.files).toHaveLength(1);
    expect(JSON.stringify(l)).not.toContain("blob.test");
    expect(status(await S.listFiles(x.c, x.out, x.owner.id, x.p.id))).toBe(404);
    const id = (ok as { ok: true; id: string }).id;
    const d = await S.downloadFile(x.c, x.cli, id);
    expect(d.status).toBe(200);
    expect(d.headers.get("x-content-type-options")).toBe("nosniff");
    expect(d.headers.get("content-disposition")).toContain("inline");
    expect((await S.downloadFile(x.c, x.out, id)).status).toBe(404);
    const csv = await up(x.eng, "levels.csv", new TextEncoder().encode("0,0,1"));
    expect((await S.downloadFile(x.c, x.cli, (csv as { id: string }).id)).headers.get("content-disposition")).toContain("attachment");
  });
  it("reports clearly when Blob storage is not set up, and limits who may delete", async () => {
    const x = await team();
    const noBlob: S.PmCtx = { ...x.c, blob: null };
    expect(status(await S.uploadFile(noBlob, x.con, { ownerId: x.owner.id, projectId: x.p.id, name: "a.png", bytes: PNG }))).toBe(503);
    const f = await S.uploadFile(x.c, x.con, { ownerId: x.owner.id, projectId: x.p.id, name: "a.png", bytes: PNG });
    const id = (f as { ok: true; id: string }).id;
    expect(status(await S.deleteFile(x.c, x.eng, id))).toBe(403); // another writer
    expect(status(await S.deleteFile(x.c, x.cli, id))).toBe(403);
    expect(status(await S.deleteFile(x.c, x.out, id))).toBe(404);
    expect((await S.deleteFile(x.c, x.con, id)).ok).toBe(true);
    expect(x.deleted).toHaveLength(1);
    const g = await S.uploadFile(x.c, x.con, { ownerId: x.owner.id, projectId: x.p.id, name: "b.png", bytes: PNG });
    expect((await S.deleteFile(x.c, x.owner, (g as { id: string }).id)).ok).toBe(true);
    expect(status(await S.deleteFile(x.c, x.owner, "nope"))).toBe(404);
  });
});

describe("activity log and routing", () => {
  it("records changes and shows them only to the owner", async () => {
    const x = await team();
    await S.putData(x.c, x.con, { ownerId: x.owner.id, projectId: x.p.id, section: "proc", value: "{}", expectedVersion: 0 });
    await S.createBackup(x.c, x.owner, { projectId: x.p.id, label: "b", bundle: JSON.stringify(buildBundle(x.p, {}, null)) });
    const a = await S.listActivity(x.c, x.owner, x.p.id);
    const actions = a.ok ? a.entries.map((e) => e.action) : [];
    expect(actions).toEqual(expect.arrayContaining(["member.set", "data.put", "backup.create"]));
    expect(a.ok && a.entries.every((e) => e.actor.includes("@"))).toBe(true);
    expect(status(await S.listActivity(x.c, x.arch, x.p.id))).toBe(404);
  });
  it("routes requests, rejects unknown paths and oversize uploads", async () => {
    const x = await team();
    setPmForTests(x.c);
    const ctx = { repo: x.repo } as unknown as Ctx;
    const req = (m: string, path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`https://app.test/api/pm/${path}`, { method: m, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    const sh = await handlePm(ctx, x.arch, req("GET", "shared"), ["shared"]);
    expect((await sh.json()).projects).toHaveLength(1);
    expect((await handlePm(ctx, x.owner, req("GET", "nothing"), ["nothing"])).status).toBe(404);
    expect((await handlePm(ctx, x.owner, req("GET", "a/b"), ["a", "b"])).status).toBe(404);
    const dp = await handlePm(ctx, x.eng, req("PUT", "data", { ownerId: x.owner.id, projectId: x.p.id, section: "qc", value: "{}", expectedVersion: 0 }), ["data"]);
    expect(dp.status).toBe(200);
    const dp2 = await handlePm(ctx, x.eng, req("PUT", "data", { ownerId: x.owner.id, projectId: x.p.id, section: "qc", value: "{}", expectedVersion: 0 }), ["data"]);
    expect(dp2.status).toBe(409);
    expect((await dp2.json()).conflict.current).toBe(1);
    const big = await handlePm(ctx, x.con, req("POST", `file?owner=${x.owner.id}&project=${x.p.id}&name=a.png`, undefined, { "content-length": "9999999" }), ["file"]);
    expect(big.status).toBe(413);
    const up = await handlePm(ctx, x.con, new Request(`https://app.test/api/pm/file?owner=${x.owner.id}&project=${x.p.id}&name=ok.png`, { method: "POST", body: PNG }), ["file"]);
    expect(up.status).toBe(200);
    const bad = await handlePm(ctx, x.owner, req("POST", "members", "{not json"), ["members"]);
    expect(bad.status).toBe(400);
    setPmForTests(undefined);
  });
});
