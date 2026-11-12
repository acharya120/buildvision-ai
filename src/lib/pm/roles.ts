/** Project roles and what each may do. Shared by the server (which enforces it) and the screens (which only use it to hide buttons). */
export type MemberRole = "architect" | "engineer" | "contractor" | "client";
export type AccessRole = "owner" | MemberRole;
export type Section = "design" | "revisions" | "proc" | "qc" | "fin" | "twin" | "files";
export type Perm = "none" | "r" | "rw";

export const MEMBER_ROLES: MemberRole[] = ["architect", "engineer", "contractor", "client"];
export const SECTIONS: Section[] = ["design", "revisions", "proc", "qc", "fin", "twin", "files"];
/** Sections that are stored as JSON in the central database (design is the project itself, files are in Blob storage). */
export const DATA_SECTIONS = ["proc", "qc", "fin", "twin", "revisions"] as const;
export type DataSection = (typeof DATA_SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = { design: "Design (plan)", revisions: "Revision register", proc: "Procurement", qc: "Site inspections", fin: "Finance & payments", twin: "Facility register", files: "Files" };
export const ROLE_LABELS: Record<AccessRole, string> = { owner: "Owner", architect: "Architect", engineer: "Engineer", contractor: "Contractor", client: "Client" };

export const MATRIX: Record<AccessRole, Record<Section, Perm>> = {
  owner:      { design: "rw", revisions: "rw", proc: "rw", qc: "rw", fin: "rw", twin: "rw", files: "rw" },
  architect:  { design: "rw", revisions: "rw", proc: "r",  qc: "rw", fin: "r",  twin: "rw", files: "rw" },
  engineer:   { design: "r",  revisions: "r",  proc: "none", qc: "rw", fin: "none", twin: "r", files: "rw" },
  contractor: { design: "r",  revisions: "r",  proc: "rw", qc: "rw", fin: "none", twin: "r", files: "rw" },
  client:     { design: "r",  revisions: "r",  proc: "none", qc: "r", fin: "r",  twin: "r", files: "r" },
};

export const can = (role: AccessRole | null, section: Section, need: "r" | "w"): boolean => {
  if (!role) return false;
  const p = MATRIX[role][section];
  return need === "r" ? p !== "none" : p === "rw";
};
/** Managing members, server backups and the activity log is for the project owner only. */
export const canManage = (role: AccessRole | null): boolean => role === "owner";
export const isMemberRole = (x: unknown): x is MemberRole => typeof x === "string" && (MEMBER_ROLES as string[]).includes(x);
export const isDataSection = (x: unknown): x is DataSection => typeof x === "string" && (DATA_SECTIONS as readonly string[]).includes(x);
