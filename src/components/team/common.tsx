"use client";

import { useEffect, useState, type ReactNode } from "react";
import { pmApi, pmStatus, type PmStatus } from "@/lib/pm/client";
import type { AccessRole } from "@/lib/pm/roles";
import { useWorkspace } from "@/lib/state/store";

export interface ProjectAccess { ownerId: string; role: AccessRole; shared: boolean }
export interface SharedRow { ownerId: string; projectId: string; name: string; role: string; updatedAt: string }

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: ReactNode }) {
  const c = tone === "bad" ? "border-red-200 bg-red-50 text-red-900" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return <p className={`rounded-lg border px-3 py-2 text-xs ${c}`}>{children}</p>;
}

/** Server status plus how the current project relates to the account: owned by me, or shared with me by someone. */
export function useTeam() {
  const ws = useWorkspace();
  const project = ws.state.project;
  const [status, setStatus] = useState<PmStatus | null>(null);
  const [shared, setShared] = useState<SharedRow[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = await pmStatus();
      if (!live) return;
      setStatus(s);
      if (s.dbConnected && s.loggedIn) { const r = await pmApi<{ projects: SharedRow[] }>("GET", "shared"); if (live && r.ok) setShared(r.data.projects); }
    })();
    return () => { live = false; };
  }, [tick]);
  const mine = shared.find((s) => s.projectId === project.id);
  const access: ProjectAccess | null = !status?.userId ? null : mine ? { ownerId: mine.ownerId, role: mine.role as AccessRole, shared: true } : { ownerId: status.userId, role: "owner", shared: false };
  return { status, shared, access, project, refresh: () => setTick((t) => t + 1) };
}

/** Explains what is missing (database, login) and renders children only when the feature can work. */
export function NeedsAccount({ status, children }: { status: PmStatus | null; children: ReactNode }) {
  if (!status) return <p className="text-sm text-ink-600">Checking…</p>;
  if (!status.dbConnected) return <Note tone="warn">This needs the database (DATABASE_URL) that is set up for accounts. It is not connected on this site, so team features are off. File backups on the Backup page still work without it.</Note>;
  if (!status.loggedIn) return <Note tone="warn">Log in to use team features (use the account button at the top of the app).</Note>;
  return <>{children}</>;
}
