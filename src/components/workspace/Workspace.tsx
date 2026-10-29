"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { getFloor, renameProject, deleteRoom, deleteWall, deleteOpening, deleteDimension } from "@/lib/model/ops";
import { serializeProject } from "@/lib/model/schema";
import { downloadText, safeFileName } from "@/lib/export/download";
import { saveProject } from "@/lib/storage/local";
import { useWorkspace } from "@/lib/state/store";
import { btn, TextField } from "../ui/Field";
import PlanEditor from "./PlanEditor";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import Viewer3D from "./Viewer3D";
import EstimatePanel from "./EstimatePanel";
import DrawingsPanel from "./DrawingsPanel";
import AssistantPanel from "./AssistantPanel";
import AutoDesignPanel from "./AutoDesignPanel";

type Tab = "plan" | "auto" | "3d" | "estimate" | "drawings" | "assistant";
const TABS: Array<[Tab, string]> = [
  ["plan", "Floor plan"],
  ["auto", "Auto design"],
  ["3d", "3D view"],
  ["estimate", "Estimate"],
  ["drawings", "Drawings & export"],
  ["assistant", "Assistant"],
];

export default function Workspace() {
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const [tab, setTab] = useState<Tab>("plan");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const issues = useMemo(() => validateProject(project), [project]);
  const counts = countBySeverity(issues);

  // autosave to browser storage (debounced)
  useEffect(() => {
    setSaveState("saving");
    const t = setTimeout(() => setSaveState(saveProject(project) ? "saved" : "failed"), 500);
    return () => clearTimeout(t);
  }, [project]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState === "failed") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  // keyboard shortcuts (ignored while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (tab !== "plan" && tab !== "3d") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        ws.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        ws.redo();
      } else if (e.key === "Escape") {
        ws.setTool("select");
        ws.select(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && tab === "plan") {
        const s = ws.getState();
        if (!s.selection) return;
        e.preventDefault();
        const p = s.project;
        const fid = s.activeFloorId;
        if (s.selection.kind === "room") ws.commit(deleteRoom(p, fid, s.selection.id));
        else if (s.selection.kind === "wall") ws.commit(deleteWall(p, fid, s.selection.id));
        else if (s.selection.kind === "opening") ws.commit(deleteOpening(p, fid, s.selection.id));
        else ws.commit(deleteDimension(p, fid, s.selection.id));
        ws.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws, tab]);

  const floor = getFloor(project, activeFloorId) ?? project.floors[0];

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-ink-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-brand-700" aria-label="Back to dashboard">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white">B</span>
            <span className="hidden sm:inline">BuildVision AI</span>
          </Link>
          <div className="w-48 sm:w-64">
            <TextField label="Project name" value={project.name} maxLength={80} onCommit={(v) => ws.commit(renameProject(ws.getState().project, v))} />
          </div>
          <span className={`text-xs ${saveState === "failed" ? "font-semibold text-red-700" : "text-ink-500"}`} role="status">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved in this browser" : "Could not save in this browser. Download a backup!"}
          </span>
          <span className="text-xs text-ink-500" title="Geometry checks">
            {counts.error > 0 ? <span className="font-semibold text-red-700">{counts.error} error{counts.error > 1 ? "s" : ""}</span> : "No errors"}
            {counts.warning > 0 && <span className="text-amber-800"> · {counts.warning} warning{counts.warning > 1 ? "s" : ""}</span>}
          </span>
          <div className="ml-auto flex gap-2">
            <button className={btn} onClick={() => downloadText(serializeProject(project), `${safeFileName(project.name)}.buildvision.json`, "application/json")}>
              Download backup
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3" aria-label="Workspace sections">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-ink-600 hover:text-ink-900"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {tab === "plan" && (
          <div className="grid min-h-full lg:h-full lg:grid-cols-[260px_minmax(0,1fr)_300px]">
            <aside className="order-2 overflow-y-auto border-ink-200 bg-ink-50 lg:order-1 lg:border-r" aria-label="Project structure and room library">
              <LeftPanel />
            </aside>
            <section className="order-1 h-[70vh] min-h-[420px] lg:order-2 lg:h-full" aria-label={`Floor plan editor, ${floor.name}`}>
              <PlanEditor issues={issues} />
            </section>
            <aside className="order-3 overflow-y-auto border-ink-200 bg-ink-50 lg:border-l" aria-label="Properties and checks">
              <RightPanel issues={issues} />
            </aside>
          </div>
        )}
        {tab === "auto" && <AutoDesignPanel onApplied={() => setTab("plan")} />}
        {tab === "3d" && <div className="h-full"><Viewer3D /></div>}
        {tab === "estimate" && <EstimatePanel />}
        {tab === "drawings" && <DrawingsPanel />}
        {tab === "assistant" && <AssistantPanel />}
      </main>
      <footer className="border-t border-ink-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-900">
        Conceptual design tool. Not an approved architectural or structural drawing. A qualified architect and structural engineer must review all plans before construction.
      </footer>
    </div>
  );
}
