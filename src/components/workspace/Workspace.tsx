"use client";

import BrandLogo from "../ui/BrandLogo";
import { useBrand } from "@/lib/client/brand";
import type { ReactElement } from "react";
import { BRAND } from "@/lib/brand";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { validateProject, countBySeverity } from "@/lib/validation/validate";
import { getFloor, renameProject, deleteRoom, deleteWall, deleteOpening, deleteDimension } from "@/lib/model/ops";
import { serializeProject } from "@/lib/model/schema";
import { downloadText, safeFileName } from "@/lib/export/download";
import { saveProject } from "@/lib/storage/local";
import { useWorkspace } from "@/lib/state/store";
import { btn, TextField } from "../ui/Field";
import { IconPlan, IconMagic, IconCube, IconCalc, IconDownload, IconChat, IconLayers, Logo } from "../ui/Icons";
import PlanEditor from "./PlanEditor";
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import Viewer3D from "./Viewer3D";
import EstimatePanel from "./EstimatePanel";
import DrawingsPanel from "./DrawingsPanel";
import AssistantPanel from "./AssistantPanel";
import AutoDesignPanel from "./AutoDesignPanel";
import StudioPanel from "../studio/StudioPanel";
import AccountMenu from "../auth/AccountMenu";

type Tab = "plan" | "auto" | "3d" | "estimate" | "drawings" | "studio" | "assistant";
const TABS: Array<[Tab, string, string, () => ReactElement]> = [
  ["plan", "Floor plan", "Plan", IconPlan],
  ["auto", "Auto design", "Auto", IconMagic],
  ["3d", "3D view", "3D", IconCube],
  ["estimate", "Estimate", "Cost", IconCalc],
  ["drawings", "Drawings & export", "Export", IconDownload],
  ["studio", "Studio", "Studio", IconLayers],
  ["assistant", "Assistant", "Help", IconChat],
];
type PlanPane = "canvas" | "rooms" | "props";

export default function Workspace() {
  const brand = useBrand();
  const ws = useWorkspace();
  const { project, activeFloorId } = ws.state;
  const [tab, setTab] = useState<Tab>("plan");
  const [planPane, setPlanPane] = useState<PlanPane>("canvas");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const issues = useMemo(() => validateProject(project), [project]);
  const counts = countBySeverity(issues);

  // show a one-time message saved by the dashboard (for example: the brief was adjusted to fit the plot)
  useEffect(() => {
    try {
      const msg = window.sessionStorage.getItem("buildvision.notice");
      if (msg) {
        window.sessionStorage.removeItem("buildvision.notice");
        ws.notify(msg);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // simple guided "what next?" hint based on what the project already contains
  const roomCount = project.floors.reduce((n, f) => n + f.rooms.length, 0);
  const openingCount = project.floors.reduce((n, f) => n + f.openings.length, 0);
  const next: { text: string; label: string; go: () => void } | null =
    roomCount === 0
      ? { text: "Start by adding rooms, or let Auto design lay out a whole building for you.", label: "Open Auto design", go: () => setTab("auto") }
      : openingCount === 0
        ? { text: "Rooms are in. Add doors and windows by choosing the Door or Window tool and clicking a wall.", label: "Go to floor plan", go: () => { setTab("plan"); setPlanPane("canvas"); } }
        : counts.error > 0
          ? { text: `${counts.error} error${counts.error > 1 ? "s" : ""} found. Open the checks list to see what to fix.`, label: "See checks", go: () => { setTab("plan"); setPlanPane("props"); } }
          : Object.keys(project.rates).length === 0
            ? { text: "Layout looks consistent. Look at it in 3D, then enter your own material rates for an estimate.", label: "Open 3D view", go: () => setTab("3d") }
            : null;

  const saveDot = saveState === "failed" ? "bg-red-500" : saveState === "saving" ? "bg-amber-400" : "bg-brand-500";
  const saveText = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved in this browser" : "Could not save in this browser. Download a backup!";
  const backup = () => downloadText(serializeProject(project), `${safeFileName(project.name)}.buildvision.json`, "application/json");

  return (
    <div className="flex h-[100dvh] flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink-800 hover:text-brand-700" aria-label="Back to dashboard">
            <BrandLogo className="h-8 w-8" />
            <span className="hidden leading-tight md:block">{brand.name}<span className="block text-[10px] font-medium text-brand-700">{brand.owner ? `by ${brand.owner}` : brand.tagline}</span></span>
          </Link>
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <TextField label="Project name" value={project.name} maxLength={80} onCommit={(v) => ws.commit(renameProject(ws.getState().project, v))} />
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-ink-500 sm:flex" role="status">
            <span className={`h-2 w-2 rounded-full ${saveDot}`} aria-hidden />
            <span className={saveState === "failed" ? "font-semibold text-red-700" : ""}>{saveText}</span>
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${counts.error > 0 ? "border-red-200 bg-red-50 text-red-800" : counts.warning > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-100 bg-brand-50 text-brand-700"}`}
            title="Geometry checks"
          >
            {counts.error > 0 ? `${counts.error} error${counts.error > 1 ? "s" : ""}` : counts.warning > 0 ? `${counts.warning} warning${counts.warning > 1 ? "s" : ""}` : "No issues"}
            {counts.error > 0 && counts.warning > 0 && <span className="hidden sm:inline">· {counts.warning} warn.</span>}
          </span>
          <button className={`${btn} shrink-0`} onClick={backup} title="Download a backup file of this project" aria-label="Download backup">
            <IconDownload />
            <span className="hidden lg:inline">Download backup</span>
          </button>
          <AccountMenu />
        </div>
        {saveState === "failed" && (
          <p className="bg-red-50 px-3 py-1 text-xs font-semibold text-red-800 sm:hidden" role="alert">{saveText}</p>
        )}
        <nav className="hidden gap-1 overflow-x-auto px-3 md:flex hide-scroll" aria-label="Workspace sections">
          {TABS.map(([id, label, , Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:bg-brand-50 ${tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-ink-600 hover:text-ink-900"}`}
            >
              <span className="scale-90"><Icon /></span>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {next && tab === "plan" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-brand-100 bg-brand-50 px-3 py-1.5 text-xs text-brand-700" role="note">
          <span className="min-w-0 flex-1 basis-56"><strong className="font-semibold">Next step:</strong> {next.text}</span>
          <button className="rounded-md bg-white px-2 py-1 font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100 hover:bg-brand-100" onClick={next.go}>{next.label}</button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-auto">
        {tab === "plan" && (
          <div className="flex min-h-full flex-col lg:grid lg:h-full lg:grid-cols-[260px_minmax(0,1fr)_300px]">
            <div className="flex gap-1 border-b border-ink-200 bg-white p-1.5 lg:hidden" role="tablist" aria-label="Floor plan sections">
              {([["canvas", "Canvas"], ["rooms", "Rooms & floors"], ["props", "Properties & checks"]] as Array<[PlanPane, string]>).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={planPane === id}
                  onClick={() => setPlanPane(id)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold sm:text-sm ${planPane === id ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <aside className={`${planPane === "rooms" ? "block" : "hidden"} overflow-y-auto border-ink-200 bg-ink-50 lg:order-1 lg:block lg:border-r thin-scroll`} aria-label="Project structure and room library">
              <LeftPanel />
            </aside>
            <section className={`${planPane === "canvas" ? "block" : "hidden"} min-h-[420px] flex-1 lg:order-2 lg:block lg:h-full`} aria-label={`Floor plan editor, ${floor.name}`}>
              <PlanEditor issues={issues} />
            </section>
            <aside className={`${planPane === "props" ? "block" : "hidden"} overflow-y-auto border-ink-200 bg-ink-50 lg:order-3 lg:block lg:border-l thin-scroll`} aria-label="Properties and checks">
              <RightPanel issues={issues} />
            </aside>
          </div>
        )}
        {tab === "auto" && <AutoDesignPanel onApplied={() => { setTab("plan"); setPlanPane("canvas"); }} />}
        {tab === "3d" && <div className="h-full min-h-[420px]"><Viewer3D /></div>}
        {tab === "estimate" && <EstimatePanel />}
        {tab === "drawings" && <DrawingsPanel />}
        {tab === "studio" && <StudioPanel />}
        {tab === "assistant" && <AssistantPanel />}
      </main>

      <footer className="mb-[3.6rem] border-t border-ink-200 bg-amber-50 px-3 py-1 text-[10px] leading-tight text-amber-900 sm:text-[11px] md:mb-0">
        Conceptual design tool. Not an approved architectural or structural drawing. A qualified architect and structural engineer must review all plans before construction. <span className="whitespace-nowrap font-semibold">BuildVision AI {BRAND.credit}</span>
      </footer>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur md:hidden" aria-label="Workspace sections">
        <ul className="grid grid-cols-7">
          {TABS.map(([id, , short, Icon]) => (
            <li key={id}>
              <button
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium ${tab === id ? "text-brand-700" : "text-ink-500"}`}
              >
                <span className={`rounded-full px-3 py-0.5 ${tab === id ? "bg-brand-100" : ""}`}><Icon /></span>
                {short}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
