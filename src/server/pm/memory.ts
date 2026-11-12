import type { MemoryRepo } from "../memoryRepo";
import type { AuditRow, BackupMeta, BackupRow, DataRow, FileRow, MemberRow, PmRepo, PutResult } from "./repo";
import type { DataSection } from "@/lib/pm/roles";

/** In-memory PmRepo for tests. Never used in production. */
export class MemoryPmRepo implements PmRepo {
  members: MemberRow[] = [];
  data = new Map<string, DataRow>();
  backups: BackupRow[] = [];
  files: FileRow[] = [];
  audit: AuditRow[] = [];
  constructor(private main: MemoryRepo) {}
  async ensureSchema() {}
  async projectMeta(o: string, p: string) { const r = this.main.projects.get(`${o}|${p}`); return r ? { name: r.name, updatedAt: r.updatedAt } : null; }
  async projectData(o: string, p: string) { return this.main.projects.get(`${o}|${p}`)?.data ?? null; }
  async saveProjectData(o: string, p: string, name: string, data: string, updatedAt: string) { this.main.projects.set(`${o}|${p}`, { id: p, name, data, updatedAt }); }
  async listMembers(o: string, p: string) { return this.members.filter((m) => m.ownerId === o && m.projectId === p).map((m) => ({ ...m })); }
  async getMember(o: string, p: string, e: string) { const m = this.members.find((x) => x.ownerId === o && x.projectId === p && x.email === e); return m ? { ...m } : null; }
  async upsertMember(m: MemberRow) { this.members = this.members.filter((x) => !(x.ownerId === m.ownerId && x.projectId === m.projectId && x.email === m.email)); this.members.push({ ...m }); }
  async deleteMember(o: string, p: string, e: string) { this.members = this.members.filter((x) => !(x.ownerId === o && x.projectId === p && x.email === e)); }
  async listSharedWith(e: string) { return this.members.filter((m) => m.email === e).map((m) => ({ ...m })); }
  private k = (o: string, p: string, s: string) => `${o}|${p}|${s}`;
  async getData(o: string, p: string, s: DataSection) { const r = this.data.get(this.k(o, p, s)); return r ? { ...r } : null; }
  async putData(row: Omit<DataRow, "version">, expected: number): Promise<PutResult> {
    const key = this.k(row.ownerId, row.projectId, row.section), cur = this.data.get(key);
    const have = cur?.version ?? 0;
    if (have !== expected) return { ok: false, current: have };
    this.data.set(key, { ...row, version: have + 1 });
    return { ok: true, version: have + 1 };
  }
  async addBackup(b: BackupRow) { this.backups.push({ ...b }); }
  async listBackups(o: string, p: string): Promise<BackupMeta[]> { return this.backups.filter((b) => b.ownerId === o && b.projectId === p).sort((a, b) => b.createdAt - a.createdAt).map(({ data: _d, ...m }) => { void _d; return m; }); }
  async getBackup(o: string, id: string) { const b = this.backups.find((x) => x.ownerId === o && x.id === id); return b ? { ...b } : null; }
  async deleteBackup(o: string, id: string) { this.backups = this.backups.filter((b) => !(b.ownerId === o && b.id === id)); }
  async pruneBackups(o: string, p: string, keep: number) {
    const mine = this.backups.filter((b) => b.ownerId === o && b.projectId === p).sort((a, b) => b.createdAt - a.createdAt);
    const drop = new Set(mine.slice(keep).map((b) => b.id));
    this.backups = this.backups.filter((b) => !drop.has(b.id));
  }
  async addFile(f: FileRow) { this.files.push({ ...f }); }
  async listFiles(o: string, p: string) { return this.files.filter((f) => f.ownerId === o && f.projectId === p).sort((a, b) => b.createdAt - a.createdAt).map((f) => ({ ...f })); }
  async getFile(id: string) { const f = this.files.find((x) => x.id === id); return f ? { ...f } : null; }
  async deleteFile(id: string) { this.files = this.files.filter((f) => f.id !== id); }
  async addAudit(a: AuditRow) { this.audit.push({ ...a }); }
  async listAudit(o: string, p: string, limit: number) { return this.audit.filter((a) => a.ownerId === o && a.projectId === p).sort((a, b) => b.at - a.at).slice(0, limit); }
}
