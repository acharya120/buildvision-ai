"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { formatArea, formatLength } from "@/lib/model/units";
import { btn, Disclaimer } from "../ui/Field";
import type { CameraPreset } from "./Scene3D";

// three.js needs the browser, so the scene is loaded on the client only
const Scene3D = dynamic(() => import("./Scene3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-ink-500">Loading 3D viewer…</div>,
});

export default function Viewer3D() {
  const ws = useWorkspace();
  const { project, selection } = ws.state;
  const sys = project.unitSystem;
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [wallFactor, setWallFactor] = useState(1);
  const [explode, setExplode] = useState(0);
  const [showWalls, setShowWalls] = useState(true);
  const [showRoof, setShowRoof] = useState(true);
  const [showWindows, setShowWindows] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showDoors, setShowDoors] = useState(true);
  const [showFurniture, setShowFurniture] = useState(false);
  const [showStairs, setShowStairs] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("perspective");
  const [cameraKey, setCameraKey] = useState(0);

  const hasRooms = project.floors.some((f) => f.rooms.length > 0);
  const selectedRoom =
    selection?.kind === "room" ? project.floors.flatMap((f) => f.rooms).find((r) => r.id === selection.id) : undefined;
  const missingWalls = project.floors.some((f) => f.rooms.length > 0 && f.walls.length === 0);

  return (
    <div className="flex h-full min-h-[520px] flex-col lg:flex-row">
      <div className="relative min-h-[360px] flex-1 bg-ink-100">
        {hasRooms ? (
          <Scene3D
            project={project}
            options={{ visible, wallFactor, explode, showWalls, showRoof, showWindows, showLabels, showDoors, showFurniture, showStairs, selectedRoomId: selectedRoom?.id ?? null, preset, cameraKey }}
            onSelectRoom={(floorId, roomId) => {
              ws.setActiveFloor(floorId);
              ws.select({ kind: "room", id: roomId });
            }}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-600">
            Nothing to show yet. Add rooms in the Plan tab and this view will build the 3D model from them.
          </div>
        )}
        <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-xs text-ink-600">
          Drag to orbit · right-drag or two fingers to pan · scroll or pinch to zoom · click a floor slab to select a room
        </p>
      </div>

      <aside className="w-full space-y-4 overflow-y-auto border-t border-ink-200 bg-white p-3 text-sm lg:w-72 lg:border-l lg:border-t-0" aria-label="3D view settings">
        {missingWalls && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            Some floors have rooms but no walls. Use <strong>Generate walls</strong> in the Plan tab to see wall geometry here.
          </p>
        )}
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">View mode</h2>
          <div className="flex flex-wrap gap-1.5">
            <button className={btn} onClick={() => { setVisible({}); setWallFactor(1); setExplode(0); setShowRoof(true); setShowFurniture(false); setShowDoors(true); setShowStairs(true); setShowLabels(true); setPreset("perspective"); setCameraKey((k) => k + 1); }}>
              Exterior
            </button>
            <button
              className={btn}
              title="Hides the roof, cuts walls to about 60%, separates the floors, and adds stairs, doors and placeholder furniture so every floor's interior can be seen at once"
              onClick={() => { setVisible({}); setWallFactor(0.6); setExplode(project.floors.length > 1 ? 3 : 0); setShowRoof(false); setShowFurniture(true); setShowDoors(true); setShowStairs(true); setShowWalls(true); setShowLabels(true); setPreset("interior"); setCameraKey((k) => k + 1); }}
            >
              Interior (all floors)
            </button>
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Camera</h2>
          <div className="flex flex-wrap gap-1.5">
            {(["perspective", "top", "front", "interior"] as CameraPreset[]).map((p) => (
              <button key={p} className={`${btn} ${preset === p ? "!border-brand-600 !bg-brand-50 !text-brand-700" : ""}`} aria-pressed={preset === p} onClick={() => { setPreset(p); setCameraKey((k) => k + 1); }}>
                {p === "perspective" ? "Perspective" : p === "top" ? "Top view" : p === "front" ? "Front view" : "Interior angle"}
              </button>
            ))}
            <button className={btn} onClick={() => setCameraKey((k) => k + 1)}>Reset camera</button>
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Floors</h2>
          {project.floors.map((f) => (
            <label key={f.id} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={visible[f.id] !== false} onChange={(e) => setVisible({ ...visible, [f.id]: e.target.checked })} />
              {f.name}
            </label>
          ))}
        </section>

        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Show</h2>
          <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={showWalls} onChange={(e) => setShowWalls(e.target.checked)} /> Walls</label>
          <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={showWindows} onChange={(e) => setShowWindows(e.target.checked)} disabled={!showWalls} /> Window glass</label>
          <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={showStairs} onChange={(e) => setShowStairs(e.target.checked)} /> Stairs (with stairwell openings)</label>
          <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={showDoors} onChange={(e) => setShowDoors(e.target.checked)} disabled={!showWalls} /> Door leaves (closed)</label>
          <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={showFurniture} onChange={(e) => setShowFurniture(e.target.checked)} /> Placeholder furniture</label>
          <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={showRoof} onChange={(e) => setShowRoof(e.target.checked)} /> Flat roof slab (simple)</label>
          <label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Room labels</label>
        </section>

        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Cutaway and exploded view</h2>
          <label className="block text-xs text-ink-600" htmlFor="cut">Wall height shown: {Math.round(wallFactor * 100)}%</label>
          <input id="cut" type="range" className="w-full" min={0.05} max={1} step={0.05} value={wallFactor} onChange={(e) => setWallFactor(Number(e.target.value))} />
          <label className="mt-2 block text-xs text-ink-600" htmlFor="exp">Floor separation: {explode.toFixed(1)} m</label>
          <input id="exp" type="range" className="w-full" min={0} max={4} step={0.25} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
        </section>

        {selectedRoom && (
          <section className="rounded-md border border-ink-200 bg-ink-50 p-2 text-xs">
            <p className="font-semibold">{selectedRoom.name}</p>
            <p>{formatLength(selectedRoom.width, sys)} × {formatLength(selectedRoom.depth, sys)} · {formatArea(selectedRoom.width * selectedRoom.depth, sys)}</p>
          </section>
        )}
        <p className="text-xs text-ink-500">Stairs are a simple visual two-flight stair, and furniture is generic placeholder boxes; neither is a design. The roof is a plain flat slab. This is a visualization of the plan, not a structural model.</p>
        <Disclaimer compact />
      </aside>
    </div>
  );
}
