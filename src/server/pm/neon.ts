import { neon } from "@neondatabase/serverless";
import type { AuditRow, BackupMeta, BackupRow, DataRow, FileRow, MemberRow, PmRepo, PutResult } from "./repo";
import type { DataSection, MemberRole } from "@/lib/pm/roles";

type Row = Record<string, unknown>;

/**
 * Neon storage for the project-management features. Every table is NEW and created with CREATE TABLE IF NOT EXISTS the first time
 * these features are used, so existing data and tables are never altered. (UNTESTED against a live Neon database in the build environment.)
 */
export function createNeonPmRepo(url: string): PmRepo {
  const sql = neon(url);
  const q = async (p: Promise<unknown>): Promise<Row[]> => (await p) as Row[];
  let ready: Promise<void> | null = null;
  const ensureSchema = () => {
    if (!ready) {
      ready = (async () => {
        await sql`CREATE TABLE IF NOT EXISTS bvx_members (
          owner_id TEXT NOT NULL, project_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, created_at BIGINT NOT NULL, invited_by TEXT NOT NULL,
          PRIMARY KEY (owner_id, project_id, email))`;
        await sql`CREATE INDEX IF NOT EXISTS bvx_members_email ON bvx_members (email)`;
        await sql`CREATE TABLE IF NOT EXISTS bvx_data (
          owner_id TEXT NOT NULL, project_id TEXT NOT NULL, section TEXT NOT NULL, value TEXT NOT NULL, version INTEGER NOT NULL,
          updated_at BIGINT NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (owner_id, project_id, section))`;
        await sql`CREATE TABLE IF NOT EXISTS bvx_backups (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, label TEXT NOT NULL, created_at BIGINT NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL)`;
        await sql`CREATE INDEX IF NOT EXISTS bvx_backups_proj ON bvx_backups (owner_id, project_id)`;
        await sql`CREATE TABLE IF NOT EXISTS bvx_files (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
          url TEXT NOT NULL, uploaded_by TEXT NOT NULL, uploaded_by_id TEXT NOT NULL, created_at BIGINT NOT NULL)`;
        await sql`CREATE INDEX IF NOT EXISTS bvx_files_proj ON bvx_files (owner_id, project_id)`;
        await sql`CREATE TABLE IF NOT EXISTS bvx_audit (
          id BIGSERIAL PRIMARY KEY, at BIGINT NOT NULL, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL)`;
        await sql`CREATE INDEX IF NOT EXISTS bvx_audit_proj ON bvx_audit (owner_id, project_id, at)`;
      })().catch((e) => { ready = null; throw e; });
    }
    return ready;
  };
  const toMember = (r: Row): MemberRow => ({ ownerId: String(r.owner_id), projectId: String(r.project_id), email: String(r.email), role: String(r.role) as MemberRole, createdAt: Number(r.created_at), invitedBy: String(r.invited_by) });
  const toFile = (r: Row): FileRow => ({ id: String(r.id), ownerId: String(r.owner_id), projectId: String(r.project_id), name: String(r.name), mime: String(r.mime), size: Number(r.size), url: String(r.url), uploadedBy: String(r.uploaded_by), uploadedById: String(r.uploaded_by_id), createdAt: Number(r.created_at) });
  const toMeta = (r: Row): BackupMeta => ({ id: String(r.id), ownerId: String(r.owner_id), projectId: String(r.project_id), label: String(r.label), createdAt: Number(r.created_at), size: Number(r.size) });

  return {
    ensureSchema,
    async projectMeta(o, p) { await ensureSchema(); const r = await q(sql`SELECT name, updated_at FROM bv_projects WHERE user_id = ${o} AND id = ${p} LIMIT 1`); return r[0] ? { name: String(r[0].name), updatedAt: String(r[0].updated_at) } : null; },
    async projectData(o, p) { await ensureSchema(); const r = await q(sql`SELECT data FROM bv_projects WHERE user_id = ${o} AND id = ${p} LIMIT 1`); return r[0] ? String(r[0].data) : null; },
    async saveProjectData(o, p, name, data, updatedAt) {
      await ensureSchema();
      await sql`INSERT INTO bv_projects (user_id, id, name, data, updated_at) VALUES (${o}, ${p}, ${name}, ${data}, ${updatedAt})
        ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`;
    },
    async listMembers(o, p) { await ensureSchema(); return (await q(sql`SELECT * FROM bvx_members WHERE owner_id = ${o} AND project_id = ${p} ORDER BY created_at`)).map(toMember); },
    async getMember(o, p, e) { await ensureSchema(); const r = await q(sql`SELECT * FROM bvx_members WHERE owner_id = ${o} AND project_id = ${p} AND email = ${e} LIMIT 1`); return r[0] ? toMember(r[0]) : null; },
    async upsertMember(m) {
      await ensureSchema();
      await sql`INSERT INTO bvx_members (owner_id, project_id, email, role, created_at, invited_by) VALUES (${m.ownerId}, ${m.projectId}, ${m.email}, ${m.role}, ${m.createdAt}, ${m.invitedBy})
        ON CONFLICT (owner_id, project_id, email) DO UPDATE SET role = EXCLUDED.role`;
    },
    async deleteMember(o, p, e) { await ensureSchema(); await sql`DELETE FROM bvx_members WHERE owner_id = ${o} AND project_id = ${p} AND email = ${e}`; },
    async listSharedWith(e) { await ensureSchema(); return (await q(sql`SELECT * FROM bvx_members WHERE email = ${e} ORDER BY created_at DESC LIMIT 200`)).map(toMember); },
    async getData(o, p, s: DataSection) {
      await ensureSchema();
      const r = await q(sql`SELECT * FROM bvx_data WHERE owner_id = ${o} AND project_id = ${p} AND section = ${s} LIMIT 1`);
      return r[0] ? { ownerId: o, projectId: p, section: s, value: String(r[0].value), version: Number(r[0].version), updatedAt: Number(r[0].updated_at), updatedBy: String(r[0].updated_by) } : null;
    },
    async putData(row: Omit<DataRow, "version">, expected: number): Promise<PutResult> {
      await ensureSchema();
      if (expected === 0) {
        const ins = await q(sql`INSERT INTO bvx_data (owner_id, project_id, section, value, version, updated_at, updated_by)
          VALUES (${row.ownerId}, ${row.projectId}, ${row.section}, ${row.value}, 1, ${row.updatedAt}, ${row.updatedBy}) ON CONFLICT DO NOTHING RETURNING version`);
        if (ins[0]) return { ok: true, version: 1 };
      } else {
        const upd = await q(sql`UPDATE bvx_data SET value = ${row.value}, version = version + 1, updated_at = ${row.updatedAt}, updated_by = ${row.updatedBy}
          WHERE owner_id = ${row.ownerId} AND project_id = ${row.projectId} AND section = ${row.section} AND version = ${expected} RETURNING version`);
        if (upd[0]) return { ok: true, version: Number(upd[0].version) };
      }
      const cur = await q(sql`SELECT version FROM bvx_data WHERE owner_id = ${row.ownerId} AND project_id = ${row.projectId} AND section = ${row.section} LIMIT 1`);
      return { ok: false, current: cur[0] ? Number(cur[0].version) : 0 };
    },
    async addBackup(b) { await ensureSchema(); await sql`INSERT INTO bvx_backups (id, owner_id, project_id, label, created_at, size, data) VALUES (${b.id}, ${b.ownerId}, ${b.projectId}, ${b.label}, ${b.createdAt}, ${b.size}, ${b.data})`; },
    async listBackups(o, p) { await ensureSchema(); return (await q(sql`SELECT id, owner_id, project_id, label, created_at, size FROM bvx_backups WHERE owner_id = ${o} AND project_id = ${p} ORDER BY created_at DESC LIMIT 50`)).map(toMeta); },
    async getBackup(o, id) { await ensureSchema(); const r = await q(sql`SELECT * FROM bvx_backups WHERE owner_id = ${o} AND id = ${id} LIMIT 1`); return r[0] ? { ...toMeta(r[0]), data: String(r[0].data) } : null; },
    async deleteBackup(o, id) { await ensureSchema(); await sql`DELETE FROM bvx_backups WHERE owner_id = ${o} AND id = ${id}`; },
    async pruneBackups(o, p, keep) {
      await ensureSchema();
      await sql`DELETE FROM bvx_backups WHERE owner_id = ${o} AND project_id = ${p} AND id NOT IN (SELECT id FROM bvx_backups WHERE owner_id = ${o} AND project_id = ${p} ORDER BY created_at DESC LIMIT ${keep})`;
    },
    async addFile(f) { await ensureSchema(); await sql`INSERT INTO bvx_files (id, owner_id, project_id, name, mime, size, url, uploaded_by, uploaded_by_id, created_at) VALUES (${f.id}, ${f.ownerId}, ${f.projectId}, ${f.name}, ${f.mime}, ${f.size}, ${f.url}, ${f.uploadedBy}, ${f.uploadedById}, ${f.createdAt})`; },
    async listFiles(o, p) { await ensureSchema(); return (await q(sql`SELECT * FROM bvx_files WHERE owner_id = ${o} AND project_id = ${p} ORDER BY created_at DESC LIMIT 300`)).map(toFile); },
    async getFile(id) { await ensureSchema(); const r = await q(sql`SELECT * FROM bvx_files WHERE id = ${id} LIMIT 1`); return r[0] ? toFile(r[0]) : null; },
    async deleteFile(id) { await ensureSchema(); await sql`DELETE FROM bvx_files WHERE id = ${id}`; },
    async addAudit(a: AuditRow) { await ensureSchema(); await sql`INSERT INTO bvx_audit (at, owner_id, project_id, actor, action, detail) VALUES (${a.at}, ${a.ownerId}, ${a.projectId}, ${a.actor}, ${a.action}, ${a.detail})`; },
    async listAudit(o, p, limit) {
      await ensureSchema();
      return (await q(sql`SELECT at, owner_id, project_id, actor, action, detail FROM bvx_audit WHERE owner_id = ${o} AND project_id = ${p} ORDER BY at DESC LIMIT ${limit}`)).map((r): AuditRow => ({ at: Number(r.at), ownerId: String(r.owner_id), projectId: String(r.project_id), actor: String(r.actor), action: String(r.action), detail: String(r.detail) }));
    },
  };
}
