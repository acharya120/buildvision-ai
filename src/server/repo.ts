/** Everything the server stores. Implemented for Neon (neonRepo.ts) and in memory for tests (memoryRepo.ts). */
export type Role = "admin" | "user";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  verified: boolean;
  disabled: boolean;
  failedLogins: number;
  lockedUntil: number; // ms since epoch, 0 = not locked
  createdAt: number;
  lastLogin: number; // 0 = never
}
export interface CodeRow {
  userId: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}
export interface ProjectRow {
  id: string;
  name: string;
  data: string; // JSON text
  updatedAt: string; // ISO text (same as project.updatedAt)
}

export interface Repo {
  ensureSchema(): Promise<void>;
  countUsers(): Promise<number>;
  createUser(u: UserRow): Promise<void>;
  updateUser(id: string, patch: Partial<Omit<UserRow, "id">>): Promise<void>;
  findUserByEmail(email: string): Promise<UserRow | null>;
  findUserById(id: string): Promise<UserRow | null>;
  listUsers(): Promise<UserRow[]>;
  deleteUser(id: string): Promise<void>;

  saveCode(c: CodeRow): Promise<void>;
  getCode(userId: string): Promise<CodeRow | null>;
  bumpCodeAttempts(userId: string): Promise<void>;
  deleteCode(userId: string): Promise<void>;

  createSession(tokenHash: string, userId: string, expiresAt: number): Promise<void>;
  getSession(tokenHash: string): Promise<{ userId: string; expiresAt: number } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  listProjects(userId: string): Promise<ProjectRow[]>;
  upsertProject(userId: string, p: ProjectRow): Promise<void>;
  deleteProject(userId: string, id: string): Promise<void>;

  getKv(userId: string, key: string): Promise<string | null>;
  setKv(userId: string, key: string, value: string): Promise<void>;

  counts(): Promise<{ users: number; projects: number }>;
}
