import { neon } from "@neondatabase/serverless";
import type { CodeRow, ProjectRow, Repo, UserRow } from "./repo";

/**
 * Neon (serverless Postgres) storage. Tables are created automatically the first time the app talks to the database.
 * Times are stored as BIGINT milliseconds; project data as TEXT (JSON).
 */
type Row = Record<string, unknown>;
const toUser = (r: Row): UserRow => ({
  id: String(r.id),
  name: String(r.name),
  email: String(r.email),
  phone: String(r.phone),
  passwordHash: String(r.password_hash),
  role: r.role === "admin" ? "admin" : "user",
  verified: r.verified === true,
  disabled: r.disabled === true,
  failedLogins: Number(r.failed_logins),
  lockedUntil: Number(r.locked_until),
  createdAt: Number(r.created_at),
  lastLogin: Number(r.last_login),
});

export function createNeonRepo(url: string): Repo {
  const sql = neon(url);
  const q = async (p: Promise<unknown>): Promise<Row[]> => (await p) as Row[];
  let ready: Promise<void> | null = null;

  const ensureSchema = () => {
    if (!ready) {
      ready = (async () => {
        await sql`CREATE TABLE IF NOT EXISTS bv_users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL,
          password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', verified BOOLEAN NOT NULL DEFAULT FALSE,
          disabled BOOLEAN NOT NULL DEFAULT FALSE, failed_logins INTEGER NOT NULL DEFAULT 0,
          locked_until BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, last_login BIGINT NOT NULL DEFAULT 0)`;
        await sql`CREATE TABLE IF NOT EXISTS bv_codes (
          user_id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at BIGINT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`;
        await sql`CREATE TABLE IF NOT EXISTS bv_sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL)`;
        await sql`CREATE TABLE IF NOT EXISTS bv_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
        await sql`CREATE TABLE IF NOT EXISTS bv_projects (
          user_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, id))`;
        await sql`CREATE TABLE IF NOT EXISTS bv_kv (user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (user_id, key))`;
      })().catch((e) => {
        ready = null; // try again next time
        throw e;
      });
    }
    return ready;
  };

  const repo: Repo = {
    ensureSchema,
    async countUsers() {
      await ensureSchema();
      const r = await q(sql`SELECT COUNT(*)::int AS n FROM bv_users`);
      return Number(r[0]?.n ?? 0);
    },
    async createUser(u) {
      await ensureSchema();
      await sql`INSERT INTO bv_users (id, name, email, phone, password_hash, role, verified, disabled, failed_logins, locked_until, created_at, last_login)
        VALUES (${u.id}, ${u.name}, ${u.email}, ${u.phone}, ${u.passwordHash}, ${u.role}, ${u.verified}, ${u.disabled}, ${u.failedLogins}, ${u.lockedUntil}, ${u.createdAt}, ${u.lastLogin})`;
    },
    async updateUser(id, patch) {
      const cur = await repo.findUserById(id);
      if (!cur) return;
      const u = { ...cur, ...patch };
      await sql`UPDATE bv_users SET name = ${u.name}, email = ${u.email}, phone = ${u.phone}, password_hash = ${u.passwordHash}, role = ${u.role},
        verified = ${u.verified}, disabled = ${u.disabled}, failed_logins = ${u.failedLogins}, locked_until = ${u.lockedUntil}, last_login = ${u.lastLogin}
        WHERE id = ${id}`;
    },
    async findUserByEmail(email) {
      await ensureSchema();
      const r = await q(sql`SELECT * FROM bv_users WHERE email = ${email} LIMIT 1`);
      return r[0] ? toUser(r[0]) : null;
    },
    async findUserById(id) {
      await ensureSchema();
      const r = await q(sql`SELECT * FROM bv_users WHERE id = ${id} LIMIT 1`);
      return r[0] ? toUser(r[0]) : null;
    },
    async listUsers() {
      await ensureSchema();
      return (await q(sql`SELECT * FROM bv_users ORDER BY created_at ASC LIMIT 1000`)).map(toUser);
    },
    async deleteUser(id) {
      await ensureSchema();
      await sql`DELETE FROM bv_codes WHERE user_id = ${id}`;
      await sql`DELETE FROM bv_sessions WHERE user_id = ${id}`;
      await sql`DELETE FROM bv_projects WHERE user_id = ${id}`;
      await sql`DELETE FROM bv_kv WHERE user_id = ${id}`;
      await sql`DELETE FROM bv_users WHERE id = ${id}`;
    },
    async saveCode(c: CodeRow) {
      await ensureSchema();
      await sql`INSERT INTO bv_codes (user_id, code_hash, expires_at, attempts, created_at) VALUES (${c.userId}, ${c.codeHash}, ${c.expiresAt}, ${c.attempts}, ${c.createdAt})
        ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = EXCLUDED.attempts, created_at = EXCLUDED.created_at`;
    },
    async getCode(userId) {
      await ensureSchema();
      const r = await q(sql`SELECT * FROM bv_codes WHERE user_id = ${userId} LIMIT 1`);
      const x = r[0];
      return x ? { userId: String(x.user_id), codeHash: String(x.code_hash), expiresAt: Number(x.expires_at), attempts: Number(x.attempts), createdAt: Number(x.created_at) } : null;
    },
    async bumpCodeAttempts(userId) {
      await sql`UPDATE bv_codes SET attempts = attempts + 1 WHERE user_id = ${userId}`;
    },
    async deleteCode(userId) {
      await sql`DELETE FROM bv_codes WHERE user_id = ${userId}`;
    },
    async createSession(tokenHash, userId, expiresAt) {
      await ensureSchema();
      await sql`INSERT INTO bv_sessions (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, ${expiresAt})`;
    },
    async getSession(tokenHash) {
      await ensureSchema();
      const r = await q(sql`SELECT user_id, expires_at FROM bv_sessions WHERE token_hash = ${tokenHash} LIMIT 1`);
      return r[0] ? { userId: String(r[0].user_id), expiresAt: Number(r[0].expires_at) } : null;
    },
    async deleteSession(tokenHash) {
      await sql`DELETE FROM bv_sessions WHERE token_hash = ${tokenHash}`;
    },
    async deleteUserSessions(userId) {
      await sql`DELETE FROM bv_sessions WHERE user_id = ${userId}`;
    },
    async getSetting(key) {
      await ensureSchema();
      const r = await q(sql`SELECT value FROM bv_settings WHERE key = ${key} LIMIT 1`);
      return r[0] ? String(r[0].value) : null;
    },
    async setSetting(key, value) {
      await ensureSchema();
      await sql`INSERT INTO bv_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    },
    async listProjects(userId) {
      await ensureSchema();
      return (await q(sql`SELECT id, name, data, updated_at FROM bv_projects WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 500`)).map(
        (r): ProjectRow => ({ id: String(r.id), name: String(r.name), data: String(r.data), updatedAt: String(r.updated_at) }),
      );
    },
    async upsertProject(userId, p) {
      await ensureSchema();
      await sql`INSERT INTO bv_projects (user_id, id, name, data, updated_at) VALUES (${userId}, ${p.id}, ${p.name}, ${p.data}, ${p.updatedAt})
        ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`;
    },
    async deleteProject(userId, id) {
      await ensureSchema();
      await sql`DELETE FROM bv_projects WHERE user_id = ${userId} AND id = ${id}`;
    },
    async getKv(userId, key) {
      await ensureSchema();
      const r = await q(sql`SELECT value FROM bv_kv WHERE user_id = ${userId} AND key = ${key} LIMIT 1`);
      return r[0] ? String(r[0].value) : null;
    },
    async setKv(userId, key, value) {
      await ensureSchema();
      await sql`INSERT INTO bv_kv (user_id, key, value) VALUES (${userId}, ${key}, ${value}) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`;
    },
    async counts() {
      await ensureSchema();
      const u = await q(sql`SELECT COUNT(*)::int AS n FROM bv_users`);
      const p = await q(sql`SELECT COUNT(*)::int AS n FROM bv_projects`);
      return { users: Number(u[0]?.n ?? 0), projects: Number(p[0]?.n ?? 0) };
    },
  };
  return repo;
}
