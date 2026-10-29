"use client";

import type { BuildingType, RoomType, UnitSystem, ValidationIssue } from "@/lib/model/types";
import { BUILDING_TYPE_LABELS, ROOM_TYPES, ROOM_TYPE_LABELS } from "@/lib/model/defaults";
import {
  deleteDimension,
  deleteOpening,
  deleteRoom,
  deleteWall,
  getFloor,
  resetDesign,
  setBuildingType,
  setPlot,
  setSettings,
  setTargetBudget,
  setUnitSystem,
  updateOpening,
  updateRoom,
  updateWall,
} from "@/lib/model/ops";
import { formatArea, formatLength, formatPlotArea } from "@/lib/model/units";
import { wallLength } from "@/lib/geometry/walls";
import { useWorkspace } from "@/lib/state/store";
import { btnDanger, inputCls, Label, LengthField, NumberField, TextField } from "../ui/Field";

const sevStyle = {
  error: "border-red-300 bg-red-50 text-red-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-ink-200 bg-ink-50 text-ink-700",
} as const;

export default function RightPanel({ issues }: { issues: ValidationIssue[] }) {
  const ws = useWorkspace();
  const { project, activeFloorId, selection } = ws.state;
  const floor = getFloor(project, activeFloorId) ?? project.floors[0];
  const sys = project.unitSystem;
  const cur = () => ws.getState().project;

  const room = selection?.kind === "room" ? floor.rooms.find((r) => r.id === selection.id) : undefined;
  const wall = selection?.kind === "wall" ? floor.walls.find((r) => r.id === selection.id) : undefined;
  const opening = selection?.kind === "opening" ? floor.openings.find((r) => r.id === selection.id) : undefined;
  const dim = selection?.kind === "dimension" ? floor.dimensions.find((r) => r.id === selection.id) : undefined;

  const shown = issues.filter((i) => i.severity !== "info");
  const infos = issues.filter((i) => i.severity === "info");

  return (
    <div className="space-y-5 p-3 text-sm">
      <section aria-labelledby="props-h">
        <h2 id="props-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Properties</h2>

        {!selection && <p className="rounded-md border border-dashed border-ink-300 p-3 text-xs text-ink-500">Select a room, wall, door, window or dimension on the plan to edit it here.</p>}

        {room && (
          <div className="space-y-2 rounded-md border border-ink-200 bg-white p-2">
            <TextField label="Room name" value={room.name} onCommit={(v) => ws.commit(updateRoom(cur(), floor.id, room.id, { name: v }))} />
            <div>
              <Label htmlFor="room-type">Room type</Label>
              <select id="room-type" className={inputCls} value={room.type} onChange={(e) => ws.commit(updateRoom(cur(), floor.id, room.id, { type: e.target.value as RoomType }))}>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{ROOM_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <LengthField label="Width" meters={room.width} system={sys} min={0.1} max={200} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { width: m }))} />
              <LengthField label="Depth" meters={room.depth} system={sys} min={0.1} max={200} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { depth: m }))} />
              <LengthField label="Position X" meters={room.x} system={sys} min={0} max={1000} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { x: m }))} />
              <LengthField label="Position Y" meters={room.y} system={sys} min={0} max={1000} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { y: m }))} />
            </div>
            <p className="text-xs text-ink-600">Area: <strong>{formatArea(room.width * room.depth, sys)}</strong></p>
            <button className={btnDanger} onClick={() => { ws.commit(deleteRoom(cur(), floor.id, room.id)); ws.select(null); }}>Delete room</button>
          </div>
        )}

        {wall && (
          <div className="space-y-2 rounded-md border border-ink-200 bg-white p-2">
            <p className="text-xs text-ink-600">{wall.auto ? "Generated wall (from room edges)" : "Drawn wall"} · length <strong>{formatLength(wallLength(wall), sys)}</strong></p>
            <LengthField label="Thickness" meters={wall.thickness} system={sys} min={0.05} max={1} onCommit={(m) => ws.commit(updateWall(cur(), floor.id, wall.id, { thickness: m }))} />
            {!wall.auto && (
              <div className="grid grid-cols-2 gap-2">
                <LengthField label="Start X" meters={wall.x1} system={sys} min={0} onCommit={(m) => ws.commit(updateWall(cur(), floor.id, wall.id, { x1: m }))} />
                <LengthField label="Start Y" meters={wall.y1} system={sys} min={0} onCommit={(m) => ws.commit(updateWall(cur(), floor.id, wall.id, { y1: m }))} />
                <LengthField label="End X" meters={wall.x2} system={sys} min={0} onCommit={(m) => ws.commit(updateWall(cur(), floor.id, wall.id, { x2: m }))} />
                <LengthField label="End Y" meters={wall.y2} system={sys} min={0} onCommit={(m) => ws.commit(updateWall(cur(), floor.id, wall.id, { y2: m }))} />
              </div>
            )}
            <button className={btnDanger} onClick={() => { ws.commit(deleteWall(cur(), floor.id, wall.id)); ws.select(null); }}>Delete wall (and its openings)</button>
          </div>
        )}

        {opening && (
          <div className="space-y-2 rounded-md border border-ink-200 bg-white p-2">
            <p className="text-xs font-semibold">{opening.kind === "door" ? "Door" : "Window"}</p>
            <div className="grid grid-cols-2 gap-2">
              <LengthField label="Width" meters={opening.width} system={sys} min={0.1} max={10} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { width: m }))} />
              <LengthField label="Height" meters={opening.height} system={sys} min={0.1} max={6} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { height: m }))} />
              <LengthField label="Sill height" meters={opening.sill} system={sys} min={0} max={6} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { sill: m }))} />
              <LengthField label="From wall start" meters={opening.offset} system={sys} min={0} max={200} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { offset: m }))} />
            </div>
            <button className={btnDanger} onClick={() => { ws.commit(deleteOpening(cur(), floor.id, opening.id)); ws.select(null); }}>Delete {opening.kind}</button>
          </div>
        )}

        {dim && (
          <div className="space-y-2 rounded-md border border-ink-200 bg-white p-2">
            <p className="text-xs text-ink-600">Dimension: <strong>{formatLength(Math.hypot(dim.x2 - dim.x1, dim.y2 - dim.y1), sys)}</strong></p>
            <button className={btnDanger} onClick={() => { ws.commit(deleteDimension(cur(), floor.id, dim.id)); ws.select(null); }}>Delete dimension</button>
          </div>
        )}
      </section>

      <section aria-labelledby="issues-h">
        <h2 id="issues-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Checks ({shown.filter((i) => i.severity === "error").length} errors, {shown.filter((i) => i.severity === "warning").length} warnings)
        </h2>
        {shown.length === 0 ? (
          <p className="rounded-md border border-green-300 bg-green-50 p-2 text-xs text-green-800">No geometry problems found. This is a geometry check only, not a building-code check.</p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((i) => (
              <li key={i.id}>
                <button
                  className={`w-full rounded-md border p-2 text-left text-xs ${sevStyle[i.severity]}`}
                  onClick={() => {
                    if (i.floorId) ws.setActiveFloor(i.floorId);
                    if (i.elementId) {
                      const f = project.floors.find((q) => q.id === i.floorId);
                      if (f?.rooms.some((r) => r.id === i.elementId)) ws.select({ kind: "room", id: i.elementId });
                      else if (f?.openings.some((r) => r.id === i.elementId)) ws.select({ kind: "opening", id: i.elementId });
                      else if (f?.walls.some((r) => r.id === i.elementId)) ws.select({ kind: "wall", id: i.elementId });
                      else if (f?.dimensions.some((r) => r.id === i.elementId)) ws.select({ kind: "dimension", id: i.elementId });
                    }
                  }}
                >
                  <span className="font-semibold uppercase">{i.severity}</span> · {i.message}
                </button>
              </li>
            ))}
          </ul>
        )}
        {infos.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-ink-500">
            {infos.map((i) => <li key={i.id}>ℹ {i.message}</li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="proj-h">
        <h2 id="proj-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Project settings</h2>
        <div className="space-y-2 rounded-md border border-ink-200 bg-white p-2">
          <div className="grid grid-cols-2 gap-2">
            <LengthField label="Plot width" meters={project.plot.width} system={sys} min={1.5} max={200} onCommit={(m) => ws.commit(setPlot(cur(), m, cur().plot.depth))} />
            <LengthField label="Plot depth" meters={project.plot.depth} system={sys} min={1.5} max={200} onCommit={(m) => ws.commit(setPlot(cur(), cur().plot.width, m))} />
          </div>
          <p className="text-xs text-ink-500">{formatPlotArea(project.plot.width * project.plot.depth)}. Changing the plot never moves rooms; anything outside is flagged above.</p>
          <div>
            <Label htmlFor="ps-units">Units</Label>
            <select id="ps-units" className={inputCls} value={sys} onChange={(e) => ws.commit(setUnitSystem(cur(), e.target.value as UnitSystem))}>
              <option value="imperial">Imperial (ft / in)</option>
              <option value="metric">Metric (m)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ps-type">Building type</Label>
            <select id="ps-type" className={inputCls} value={project.buildingType} onChange={(e) => ws.commit(setBuildingType(cur(), e.target.value as BuildingType))}>
              {(Object.keys(BUILDING_TYPE_LABELS) as BuildingType[]).map((t) => <option key={t} value={t}>{BUILDING_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <NumberField label="Target budget (optional)" value={project.targetBudget} onCommit={(v) => ws.commit(setTargetBudget(cur(), v))} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={project.settings.snap} onChange={(e) => ws.commit(setSettings(cur(), { snap: e.target.checked }))} /> Snap to grid</label>
          <LengthField label="Grid step" meters={project.settings.gridStep} system={sys} min={0.01} max={2} onCommit={(m) => ws.commit(setSettings(cur(), { gridStep: m }))} />
          <LengthField label="Interior wall thickness" meters={project.settings.defaultWallThickness} system={sys} min={0.05} max={1} onCommit={(m) => ws.commit(setSettings(cur(), { defaultWallThickness: m }))} />
          <LengthField label="Exterior wall thickness" meters={project.settings.exteriorWallThickness} system={sys} min={0.05} max={1} onCommit={(m) => ws.commit(setSettings(cur(), { exteriorWallThickness: m }))} />
          <p className="text-xs text-ink-500">Room sizes are measured to wall centre-lines. Thickness changes apply the next time you click Generate walls.</p>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={project.settings.allowOverlap} onChange={(e) => ws.commit(setSettings(cur(), { allowOverlap: e.target.checked }))} /> Allow rooms to overlap</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={project.settings.requireAdjoining} onChange={(e) => ws.commit(setSettings(cur(), { requireAdjoining: e.target.checked }))} /> Warn about rooms with no neighbour</label>
          <button
            className={btnDanger}
            onClick={() => {
              if (window.confirm("Reset the design? All rooms, walls, doors, windows and dimensions on every floor will be removed. You can still use Undo.")) {
                ws.commit(resetDesign(cur()));
                ws.select(null);
              }
            }}
          >
            Reset design…
          </button>
        </div>
      </section>
    </div>
  );
}
