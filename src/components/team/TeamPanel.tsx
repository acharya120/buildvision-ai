"use client";

import { useState } from "react";
import { Chip } from "../studio/shared";
import { ActivityPage, BackupPage, FilesPage, SharingPage, SyncPage } from "./PagesTeam";

const PAGES = [["share", "Sharing & roles"], ["sync", "Central database"], ["backup", "Backup & recovery"], ["files", "Files"], ["log", "Activity"]] as const;
type Page = (typeof PAGES)[number][0];

/** Team features: roles, shared database, backups, files. Needs the account database; backup files work without it. */
export default function TeamPanel() {
  const [page, setPage] = useState<Page>("backup");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Team and backup sections" className="flex gap-1.5 overflow-x-auto pb-1">{PAGES.map(([id, label]) => <Chip key={id} active={page === id} onClick={() => setPage(id)}>{label}</Chip>)}</div>
      {page === "share" && <SharingPage />}
      {page === "sync" && <SyncPage />}
      {page === "backup" && <BackupPage />}
      {page === "files" && <FilesPage />}
      {page === "log" && <ActivityPage />}
    </div>
  );
}
