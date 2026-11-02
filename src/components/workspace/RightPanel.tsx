"use client";

import { useMemo } from "react";
import { DEFAULT_DETAIL, DEFAULT_LOADS, DEFAULT_SITE } from "@/lib/model/defaults";
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
  setSite,
  setDetail,
  setNorth,
  setUnitSystem,
  updateOpening,
  updateRoom,
  updateWall,
} from "@/lib/model/ops";
import { formatArea, formatLength, formatPlotArea } from "@/lib/model/units";
import { areaSummary } from "@/lib/structure/areas";
import { computeLoads } from "@/lib/structure/loads";
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
  const areas = useMemo(() => areaSummary(project), [project]);
  const loadRes = useMemo(() => computeLoads(project), [project]);
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
              <LengthField label="Width" meters={room.width} system={sys} min={0.1} max={5000} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { width: m }))} />
              <LengthField label="Depth" meters={room.depth} system={sys} min={0.1} max={5000} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { depth: m }))} />
              <LengthField label="Position X" meters={room.x} system={sys} min={0} max={10000} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { x: m }))} />
              <LengthField label="Position Y" meters={room.y} system={sys} min={0} max={10000} onCommit={(m) => ws.commit(updateRoom(cur(), floor.id, room.id, { y: m }))} />
            </div>
            <p className="text-xs text-ink-600">Area: <strong>{formatArea(room.width * room.depth, sys)}</strong></p>
            <button className={btnDanger} onClick={() => { ws.commit(deleteRoom(cur(), floor.id, room.id)); ws.select(null); }}>Delete room</button>
          </div>
        )}

        {wall && (
          <div className="space-y-2 rounded-md border border-ink-200 bg-white p-2">
            <p className="text-xs text-ink-600">{wall.auto ? "Generated wall (from room edges)" : "Drawn wall"} · length <strong>{formatLength(wallLength(wall), sys)}</strong></p>
            <LengthField label="Thickness" meters={wall.thickness} system={sys} min={0.05} max={3} onCommit={(m) => ws.commit(updateWall(cur(), floor.id, wall.id, { thickness: m }))} />
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
              <LengthField label="Width" meters={opening.width} system={sys} min={0.1} max={50} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { width: m }))} />
              <LengthField label="Height" meters={opening.height} system={sys} min={0.1} max={20} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { height: m }))} />
              <LengthField label="Sill height" meters={opening.sill} system={sys} min={0} max={20} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { sill: m }))} />
              <LengthField label="From wall start" meters={opening.offset} system={sys} min={0} max={5000} onCommit={(m) => ws.commit(updateOpening(cur(), floor.id, opening.id, { offset: m }))} />
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
            <LengthField label="Plot width" meters={project.plot.width} system={sys} min={1.5} max={5000} onCommit={(m) => ws.commit(setPlot(cur(), m, cur().plot.depth))} />
            <LengthField label="Plot depth" meters={project.plot.depth} system={sys} min={1.5} max={5000} onCommit={(m) => ws.commit(setPlot(cur(), cur().plot.width, m))} />
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
          <NumberField label="North direction (degrees clockwise from the top of the plan; 0 = north is up)" value={project.northAngle ?? 0} allowEmpty={false} min={-360} onCommit={(v) => v != null && ws.commit(setNorth(cur(), v))} />
          <fieldset className="rounded-md border border-ink-200 p-2">
            <legend className="px-1 text-xs font-semibold">Areas and FAR</legend>
            <div className="space-y-0.5 text-xs">
              {([["Plot area", formatArea(areas.plotArea, sys), false], ...areas.floors.map((f) => [`${f.name} built-up`, formatArea(f.builtUp, sys), false] as const), ["Total built-up", formatArea(areas.totalBuiltUp, sys), true], ["FAR", areas.far.toFixed(2), true], ["Ground coverage", `${areas.coveragePct.toFixed(1)}%`, false], ["Open area", formatArea(areas.openArea, sys), false]] as ReadonlyArray<readonly [string, string, boolean]>).map(([k, v, bold], i) => (
                <div key={i} className={`flex justify-between gap-2 ${bold ? "font-semibold" : ""}`}><span>{k}</span><span className="text-right">{v}</span></div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-500">Built-up = rooms plus half the outside wall thickness, every floor counted in full. Local rules often exempt stairs, parking or balconies and set their own FAR limit, so check with your authority.</p>
          </fieldset>
          <fieldset className="rounded-md border border-ink-200 p-2">
            <legend className="px-1 text-xs font-semibold">Details: structure, furniture, stairs</legend>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!project.detail} onChange={(e) => ws.commit(setDetail(cur(), e.target.checked ? DEFAULT_DETAIL : null))} /> Show extra drawing details</label>
            {project.detail && (
              <div className="mt-1 space-y-1">
                {([["grid", "Grid lines with labels and spacing"], ["columns", "Columns"], ["beams", "Beams (dashed)"], ["footings", "Footings (ground floor, dashed)"], ["furniture", "Furniture symbols"], ["stairs", "Stair steps and UP / DN"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={project.detail![k]} onChange={(e) => ws.commit(setDetail(cur(), { ...project.detail!, [k]: e.target.checked }))} /> {label}</label>
                ))}
                <LengthField label="Column size (square)" meters={project.detail.columnSize} system={sys} min={0.1} max={2} onCommit={(m) => ws.commit(setDetail(cur(), { ...project.detail!, columnSize: m }))} />
                <LengthField label="Longest span between columns" meters={project.detail.maxSpan} system={sys} min={2} max={20} onCommit={(m) => ws.commit(setDetail(cur(), { ...project.detail!, maxSpan: m }))} />
                <LengthField label="Footing size (square)" meters={project.detail.footingSize} system={sys} min={0.4} max={6} onCommit={(m) => ws.commit(setDetail(cur(), { ...project.detail!, footingSize: m }))} />
                <LengthField label="Beam depth" meters={project.detail.beamDepth} system={sys} min={0.15} max={2} onCommit={(m) => ws.commit(setDetail(cur(), { ...project.detail!, beamDepth: m }))} />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!project.detail.loads} onChange={(e) => ws.commit(setDetail(cur(), { ...project.detail!, loads: e.target.checked ? DEFAULT_LOADS : undefined }))} /> Load distribution (optional, indicative)</label>
                {project.detail.loads && (
                  <div className="space-y-1 rounded border border-ink-200 p-2">
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={project.detail.loads.show} onChange={(e) => ws.commit(setDetail(cur(), { ...project.detail!, loads: { ...project.detail!.loads!, show: e.target.checked } }))} /> Write the load (kN) next to each column</label>
                    {([["finishDead", "Floor finish + partitions (kN/m²)", 0], ["liveLoad", "Live load on floors (kN/m²)", 0], ["roofLoad", "Live load on top slab (kN/m²)", 0], ["wallWeight", "Wall weight (kN/m³)", 1], ["bearing", "Allowed soil pressure (kN/m²)", 10]] as const).map(([k, label, min]) => (
                      <NumberField key={k} label={label} value={project.detail!.loads![k]} allowEmpty={false} min={min} onCommit={(v) => v != null && ws.commit(setDetail(cur(), { ...project.detail!, loads: { ...project.detail!.loads!, [k]: v } }))} />
                    ))}
                    <LengthField label="Slab thickness" meters={project.detail.loads.slabThickness} system={sys} min={0.05} max={1} onCommit={(m) => ws.commit(setDetail(cur(), { ...project.detail!, loads: { ...project.detail!.loads!, slabThickness: m } }))} />
                    {loadRes && (
                      <div className="text-[11px]">
                        <p className="font-semibold">Load reaching the ground: {Math.round(loadRes.totalToGround)} kN (service)</p>
                        <table className="mt-1 w-full text-left">
                          <thead><tr><th>Column</th><th>Load kN</th><th>Soil kN/m²</th><th>Footing side needed</th></tr></thead>
                          <tbody>
                            {[...loadRes.footings].sort((a, b) => b.load - a.load).slice(0, 8).map((f) => (
                              <tr key={f.ref} className={f.ok ? "" : "font-semibold text-red-700"}>
                                <td>{f.ref}</td><td>{Math.round(f.load)}</td><td>{Math.round(f.pressure)}{f.ok ? "" : " (over)"}</td><td>{formatLength(f.neededSide, sys)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {loadRes.footings.length > 8 && <p className="text-ink-500">Heaviest 8 of {loadRes.footings.length} columns shown. Footings are only reported, never resized for you.</p>}
                      </div>
                    )}
                    <p className="text-[11px] text-ink-500">Each slab's load is shared between columns by grid area, wall weight goes to the beams' end columns, and loads are carried down floor by floor. The starting values are placeholders, not from any code. No wind, earthquake, load factors or soil investigation: not a structural design.</p>
                  </div>
                )}
                <p className="text-[11px] text-ink-500">An indicative layout drawn from your walls: columns at corners and junctions, extra columns where a wall is longer than your span limit, beams between them. The sizes are placeholders you can change. It is not a structural design; a structural engineer must design the real structure.</p>
              </div>
            )}
          </fieldset>
          <fieldset className="rounded-md border border-ink-200 p-2">
            <legend className="px-1 text-xs font-semibold">Site: garden, gates, trees</legend>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!project.site} onChange={(e) => ws.commit(setSite(cur(), e.target.checked ? DEFAULT_SITE : null))} /> Show surroundings</label>
            {project.site && (
              <div className="mt-1 space-y-1">
                {([["lawn", "Lawn / garden"], ["boundaryWall", "Boundary wall"], ["entranceGate", "Entrance gate (from your main door)"], ["exitGate", "Exit gate (opposite side)"], ["paths", "Paths / driveway"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={project.site![k]} onChange={(e) => ws.commit(setSite(cur(), { ...project.site!, [k]: e.target.checked }))} /> {label}</label>
                ))}
                <label className="block text-xs" htmlFor="site-trees">Trees</label>
                <select id="site-trees" className={inputCls} value={project.site.trees} onChange={(e) => ws.commit(setSite(cur(), { ...project.site!, trees: e.target.value as "none" | "few" | "many" }))}>
                  <option value="none">None</option>
                  <option value="few">A few</option>
                  <option value="many">Many</option>
                </select>
                <p className="text-[11px] text-ink-500">Placed from your doors and the free space on the plot. Not a landscape or traffic design.</p>
              </div>
            )}
          </fieldset>
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
