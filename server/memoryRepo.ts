import type { CodeRow, ProjectRow, Repo, UserRow } from "./repo";

/** In-memory Repo used by the tests. Never used in production. */
export class MemoryRepo implements Repo {
  users = new Map<string, UserRow>();
  codes = new Map<string, CodeRow>();
  sessions = new Map<string, { userId: string; expiresAt: number }>();
  settings = new Map<string, string>();
  projects = new Map<string, ProjectRow>();
  kv = new Map<string, string>();
  async ensureSchema() {}
  async countUsers() { return this.users.size; }
  async createUser(u: UserRow) { this.users.set(u.id, { ...u }); }
  async updateUser(id: string, patch: Partial<Omit<UserRow, "id">>) { const u = this.users.get(id); if (u) this.users.set(id, { ...u, ...patch }); }
  async findUserByEmail(email: string) { for (const u of this.users.values()) if (u.email === email) return { ...u }; return null; }
  async findUserById(id: string) { const u = this.users.get(id); return u ? { ...u } : null; }
  async listUsers() { return [...this.users.values()].map((u) => ({ ...u })).sort((a, b) => a.createdAt - b.createdAt); }
  async deleteUser(id: string) {
    this.users.delete(id); this.codes.delete(id);
    for (const [k, s] of this.sessions) if (s.userId === id) this.sessions.delete(k);
    for (const k of [...this.projects.keys()]) if (k.startsWith(id + "|")) this.projects.delete(k);
    for (const k of [...this.kv.keys()]) if (k.startsWith(id + "|")) this.kv.delete(k);
  }
  async saveCode(c: CodeRow) { this.codes.set(c.userId, { ...c }); }
  async getCode(userId: string) { const c = this.codes.get(userId); return c ? { ...c } : null; }
  async bumpCodeAttempts(userId: string) { const c = this.codes.get(userId); if (c) c.attempts += 1; }
  async deleteCode(userId: string) { this.codes.delete(userId); }
  async createSession(t: string, userId: string, expiresAt: number) { this.sessions.set(t, { userId, expiresAt }); }
  async getSession(t: string) { return this.sessions.get(t) ?? null; }
  async deleteSession(t: string) { this.sessions.delete(t); }
  async deleteUserSessions(userId: string) { for (const [k, s] of this.sessions) if (s.userId === userId) this.sessions.delete(k); }
  async getSetting(k: string) { return this.settings.get(k) ?? null; }
  async setSetting(k: string, v: string) { this.settings.set(k, v); }
  async listProjects(userId: string) { return [...this.projects.entries()].filter(([k]) => k.startsWith(userId + "|")).map(([, p]) => ({ ...p })); }
  async upsertProject(userId: string, p: ProjectRow) { this.projects.set(`${userId}|${p.id}`, { ...p }); }
  async deleteProject(userId: string, id: string) { this.projects.delete(`${userId}|${id}`); }
  async getKv(userId: string, key: string) { return this.kv.get(`${userId}|${key}`) ?? null; }
  async setKv(userId: string, key: string, value: string) { this.kv.set(`${userId}|${key}`, value); }
  async counts() { return { users: this.users.size, projects: this.projects.size }; }
}
