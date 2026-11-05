"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/model/types";
import { loadProject } from "@/lib/storage/local";
import { WorkspaceProvider } from "@/lib/state/store";
import Workspace from "./Workspace";
import { btnPrimary } from "../ui/Field";

export default function WorkspaceLoader() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [state, setState] = useState<{ status: "loading" } | { status: "missing" } | { status: "ready"; project: Project }>({ status: "loading" });

  useEffect(() => {
    if (!id) return;
    const p = loadProject(id);
    setState(p ? { status: "ready", project: p } : { status: "missing" });
  }, [id]);

  if (state.status === "loading") return <p className="p-6 text-sm text-ink-500">Loading project…</p>;
  if (state.status === "missing")
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Project not found</h1>
        <p className="mt-2 text-sm text-ink-600">
          This project is stored in the browser where it was created. It may have been deleted, or you may be using a different browser or device. You can import a JSON backup from the dashboard.
        </p>
        <Link href="/" className={`${btnPrimary} mt-4`}>Back to dashboard</Link>
      </div>
    );
  return (
    <WorkspaceProvider key={state.project.id} initial={state.project}>
      <Workspace />
    </WorkspaceProvider>
  );
}
