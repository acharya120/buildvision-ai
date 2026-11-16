"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { DEFAULT_THEME } from "@/lib/geometry/theme3d";
import type { ValidationIssue } from "@/lib/model/types";
import PlanEditor from "./PlanEditor";
import LiveSummaryBar from "./LiveSummaryBar";
import { btn } from "../ui/Field";

const Scene3D = dynamic(() => import("./Scene3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-ink-500">Loading 3D preview…</div>,
});
const KEY = "buildvision.split3d";

/**
 * The plan editor exactly as before, plus two optional extras: a live 3D preview beside it ("Split with 3D", off by
 * default) and a live area/quantity strip below. Clicking a room in 3D selects it in the plan.
 */
export default function PlanCanvasArea({ issues }: { issues: ValidationIssue[] }) {
  const ws = useWorkspace();
  const { project, selection } = ws.state;
  const [split, setSplit] = useState(false);
  useEffect(() => { try { if (window.localStorage.getItem(KEY) === "1") setSplit(true); } catch { /* ignore */ } }, []);
  const toggle = () => setSplit((v) => { const n = !v; try { window.localStorage.setItem(KEY, n ? "1" : "0"); } catch { /* ignore */ } return n; });
  const hasRooms = project.floors.some((f) => f.rooms.length > 0);
  const selected = selection?.kind === "room" ? project.floors.flatMap((f) => f.rooms).find((r) => r.id === selection.id) : undefined;

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="hidden items-center gap-2 border-b border-ink-200 bg-white px-2 py-1 md:flex">
        <button className={`${btn} ${split ? "ring-2 ring-brand-500" : ""}`} aria-pressed={split} onClick={toggle} title="Show a live 3D preview next to the plan">
          {split ? "Hide 3D preview" : "Split with 3D"}
        </button>
        {split && <span className="hidden text-xs text-ink-500 sm:inline">The 3D preview follows every edit. Use the 3D tab for all view controls.</span>}
      </div>
      <div className={split ? "min-h-0 flex-1 md:grid md:grid-rows-2 xl:grid-cols-2 xl:grid-rows-1" : "min-h-0 flex-1"}>
        <div className="min-h-0 overflow-hidden"><PlanEditor issues={issues} /></div>
        {split && (
          <div className="relative hidden min-h-[260px] border-t md:block border-ink-200 bg-ink-100 xl:border-l xl:border-t-0" data-testid="split-3d" aria-label="Live 3D preview">
            {hasRooms ? (
              <Scene3D
                project={project}
                options={{ visible: {}, wallFactor: 1, explode: 0, showWalls: true, showRoof: true, showWindows: true, showLabels: true, showDoors: true, showFurniture: !!project.detail?.furniture, showStairs: true, showSite: true, showStructure: true, theme: DEFAULT_THEME, selectedRoomId: selected?.id ?? null, preset: "perspective", cameraKey: 0 }}
                onSelectRoom={(floorId, roomId) => { ws.setActiveFloor(floorId); ws.select({ kind: "room", id: roomId }); }}
              />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-600">Add rooms and the 3D preview appears here.</div>
            )}
          </div>
        )}
      </div>
      <LiveSummaryBar />
    </div>
  );
}
