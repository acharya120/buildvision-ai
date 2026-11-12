import type { AccessRole, DataSection, MemberRole } from "@/lib/pm/roles";

/** Storage for the project-management features. These tables are all NEW (prefix bvx_); the existing tables are only read, and bv_projects is written only by the architect "publish" action. */
export interface MemberRow { ownerId: string; projectId: string; email: string; role: MemberRole; createdAt: number; invitedBy: string }
export interface DataRow { ownerId: string; projectId: string; section: DataSection; value: string; version: number; updatedAt: number; updatedBy: string }
export interface BackupMeta { id: string; ownerId: string; projectId: string; label: string; createdAt: number; size: number }
export interface BackupRow extends BackupMeta { data: string }
export interface FileRow { id: string; ownerId: string; projectId: string; name: string; mime: string; size: number; url: string; uploadedBy: string; uploadedById: string; createdAt: number }
export interface AuditRow { at: number; ownerId: string; projectId: string; actor: string; action: string; detail: string }
export type PutResult = { ok: true; version: number } | { ok: false; current: number };

export interface PmRepo {
  ensureSchema(): Promise<void>;
  // existing project table (read; write only for architect publish)
  projectMeta(ownerId: string, projectId: string): Promise<{ name: string; updatedAt: string } | null>;
  projectData(ownerId: string, projectId: string): Promise<string | null>;
  saveProjectData(ownerId: string, projectId: string, name: string, data: string, updatedAt: string): Promise<void>;
  // members
  listMembers(ownerId: string, projectId: string): Promise<MemberRow[]>;
  getMember(ownerId: string, projectId: string, email: string): Promise<MemberRow | null>;
  upsertMember(m: MemberRow): Promise<void>;
  deleteMember(ownerId: string, projectId: string, email: string): Promise<void>;
  listSharedWith(email: string): Promise<MemberRow[]>;
  // central data (optimistic version check)
  getData(ownerId: string, projectId: string, section: DataSection): Promise<DataRow | null>;
  putData(row: Omit<DataRow, "version">, expectedVersion: number): Promise<PutResult>;
  // server backups
  addBackup(b: BackupRow): Promise<void>;
  listBackups(ownerId: string, projectId: string): Promise<BackupMeta[]>;
  getBackup(ownerId: string, id: string): Promise<BackupRow | null>;
  deleteBackup(ownerId: string, id: string): Promise<void>;
  pruneBackups(ownerId: string, projectId: string, keep: number): Promise<void>;
  // files (metadata; the bytes live in Blob storage)
  addFile(f: FileRow): Promise<void>;
  listFiles(ownerId: string, projectId: string): Promise<FileRow[]>;
  getFile(id: string): Promise<FileRow | null>;
  deleteFile(id: string): Promise<void>;
  // activity
  addAudit(a: AuditRow): Promise<void>;
  listAudit(ownerId: string, projectId: string, limit: number): Promise<AuditRow[]>;
}
export type { AccessRole };
