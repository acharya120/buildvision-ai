"use client";

import { useEffect, useState } from "react";
import type { RoomType } from "@/lib/model/types";
import { ROOM_TYPES, ROOM_TYPE_LABELS, makeRoom } from "@/lib/model/defaults";
import { addFloor, addRoom, findFreeSpot, getFloor, removeFloor, renameFloor, setFloorHeight, totalRoomArea, LIMITS } from "@/lib/model/ops";
import { formatArea, formatLength } from "@/lib/model/units";
import { isValidRect } from "@/lib/geometry/rect";
import { useWorkspace } from "@/lib/state/store";
import { defaultLibrary, loadLibrary, saveLibrary, type RoomLibrary } from "@/lib/storage/roomLibrary";
import { btn, btnDanger, btnPrimary, inputCls, Label, LengthField, TextField } from "../ui/Field";

export default function LeftPanel() {
  const ws = useWorkspace();
  const { project, activeFloorId, selection, roomType, tool } = ws.state;
  const floor = getFloor(project, activeFloorId) ?? project.floors[0];
  const sys = project.unitSystem;
  const [lib, setLib] = useState<RoomLibrary>(defaultLibrary());
  useEffect(() => setLib(loadLibrary()), []);

  // "add a room with exact size" form (works for every room type)
  const [addType, setAddType] = useState<RoomType>("bedroom");
  const [addName, setAddName] = useState("");
  const [addW, setAddW] = useState<number | null>(null);
  const [addD, setAddD] = useState<number | null>(null);
  const [addAuto, setAddAuto] = useState(true);
  const [addX, setAddX] = useState(0);
  const [addY, setAddY] = useState(0);
  const [addMsg, setAddMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const addWidth = addW ?? lib[addType].width;
  const addDepth = addD ?? lib[addType].depth;
  const used = totalRoomArea(floor);
  const plotArea = project.plot.width * project.plot.depth;

  const addManual = () => {
    const cur = ws.getState().project;
    const fid = ws.getState().activeFloorId;
    const plot = cur.plot;
    if (!(addWidth > 0) || !(addDepth > 0)) return setAddMsg({ kind: "error", text: "Width and depth must both be greater than zero." });
    if (addWidth > plot.width + 1e-6 || addDepth > plot.depth + 1e-6)
      return setAddMsg({ kind: "error", text: `This room (${formatLength(addWidth, sys)} × ${formatLength(addDepth, sys)}) is bigger than the plot (${formatLength(plot.width, sys)} × ${formatLength(plot.depth, sys)}).` });
    let pos: { x: number; y: number } | null;
    if (addAuto) {
      pos = findFreeSpot(cur, fid, addWidth, addDepth);
      if (!pos) return setAddMsg({ kind: "error", text: "There is no free space for this size on this floor. Make it smaller, remove a room, or turn off 'place automatically' and enter a position yourself." });
    } else pos = { x: addX, y: addY };
    const room = makeRoom(addType, pos.x, pos.y, { width: addWidth, depth: addDepth }, addName.trim() || undefined);
    ws.commit(addRoom(cur, fid, room));
    ws.select({ kind: "room", id: room.id });
    setAddMsg({ kind: "ok", text: `Added ${room.name} (${formatLength(addWidth, sys)} × ${formatLength(addDepth, sys)}) to ${floor.name}. Overlap or boundary problems, if any, appear in the checks.` });
  };

  const updateLib = (type: RoomType, patch: Partial<{ width: number; depth: number }>) => {
    const next = { ...lib, [type]: { ...lib[type], ...patch } };
    setLib(next);
    saveLibrary(next);
  };

  return (
    <div className="space-y-5 p-3 text-sm">
      <section aria-labelledby="floors-h">
        <h2 id="floors-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Floors</h2>
        <ul className="space-y-1">
          {project.floors.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => ws.setActiveFloor(f.id)}
                aria-current={f.id === floor.id}
                className={`w-full rounded-md border px-2 py-1.5 text-left ${f.id === floor.id ? "border-brand-600 bg-brand-50 font-semibold" : "border-ink-200 bg-white hover:bg-ink-50"}`}
              >
                {f.name} <span className="text-xs font-normal text-ink-500">· {f.rooms.length} rooms</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-2 rounded-md border border-ink-200 bg-white p-2">
          <TextField label="Selected floor name" value={floor.name} onCommit={(v) => ws.commit(renameFloor(ws.getState().project, floor.id, v))} />
          <LengthField label="Floor-to-floor height" meters={floor.height} system={sys} min={2} max={6} onCommit={(m) => ws.commit(setFloorHeight(ws.getState().project, floor.id, m))} />
          <div className="flex gap-2">
            <button
              className={btn}
              disabled={project.floors.length >= LIMITS.maxFloors}
              onClick={() => {
                const res = addFloor(ws.getState().project);
                if (res) {
                  ws.commit(res.project);
                  ws.setActiveFloor(res.floorId);
                }
              }}
            >
              + Add floor
            </button>
            <button
              className={btnDanger}
              disabled={project.floors.length <= 1}
              onClick={() => {
                if (window.confirm(`Remove "${floor.name}" and everything on it?`)) ws.commit(removeFloor(ws.getState().project, floor.id));
              }}
            >
              Remove floor
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="addroom-h" className="rounded-md border border-brand-500 bg-white p-2">
        <h2 id="addroom-h" className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Add room with exact size</h2>
        <p className="mb-2 text-xs text-ink-500">
          For {floor.name}. Rooms here use {formatArea(used, sys)} of the {formatArea(plotArea, sys)} plot ({formatArea(Math.max(0, plotArea - used), sys)} unused). Works for every room type.
        </p>
        <div className="space-y-2">
          <div>
            <Label htmlFor="add-type">Room type</Label>
            <select
              id="add-type"
              className={inputCls}
              value={addType}
              onChange={(e) => {
                setAddType(e.target.value as RoomType);
                setAddW(null);
                setAddD(null);
                setAddName("");
              }}
            >
              {ROOM_TYPES.map((t) => (
                <option key={t} value={t}>{ROOM_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <TextField key={`n-${addType}`} label="Name (optional)" value={addName} maxLength={60} onCommit={setAddName} />
          <div className="grid grid-cols-2 gap-2">
            <LengthField key={`w-${addType}-${addW ?? "d"}`} label="Width" meters={addWidth} system={sys} min={0.3} max={50} onCommit={(m) => setAddW(m)} />
            <LengthField key={`d-${addType}-${addD ?? "d"}`} label="Depth" meters={addDepth} system={sys} min={0.3} max={50} onCommit={(m) => setAddD(m)} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={addAuto} onChange={(e) => setAddAuto(e.target.checked)} />
            Place automatically in free space
          </label>
          {!addAuto && (
            <div className="grid grid-cols-2 gap-2">
              <LengthField label="Position X" meters={addX} system={sys} min={0} max={500} onCommit={setAddX} />
              <LengthField label="Position Y" meters={addY} system={sys} min={0} max={500} onCommit={setAddY} />
            </div>
          )}
          <button className={btnPrimary} onClick={addManual}>Add {ROOM_TYPE_LABELS[addType].toLowerCase()}</button>
          {addMsg && (
            <p role={addMsg.kind === "error" ? "alert" : "status"} className={`text-xs ${addMsg.kind === "error" ? "text-red-700" : "text-emerald-800"}`}>{addMsg.text}</p>
          )}
        </div>
      </section>

      <section aria-labelledby="lib-h">
        <h2 id="lib-h" className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Room library</h2>
        <p className="mb-2 text-xs text-ink-500">Pick a type, then click the plan. Sizes are starting suggestions you can edit.</p>
        <div className="grid grid-cols-2 gap-1">
          {ROOM_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                ws.setRoomType(t);
                ws.setTool("room");
              }}
              className={`rounded-md border px-2 py-1 text-left text-xs ${tool === "room" && roomType === t ? "border-brand-600 bg-brand-50 font-semibold" : "border-ink-200 bg-white hover:bg-ink-50"}`}
              title={`${formatLength(lib[t].width, sys)} × ${formatLength(lib[t].depth, sys)}`}
            >
              {ROOM_TYPE_LABELS[t]}
              <span className="block font-normal text-ink-500">{formatLength(lib[t].width, sys)} × {formatLength(lib[t].depth, sys)}</span>
            </button>
          ))}
        </div>
        <details className="mt-2 rounded-md border border-ink-200 bg-white p-2">
          <summary className="cursor-pointer text-xs font-medium">Edit default room sizes</summary>
          <div className="mt-2 space-y-3">
            {ROOM_TYPES.map((t) => (
              <div key={t}>
                <p className="mb-1 text-xs font-semibold">{ROOM_TYPE_LABELS[t]}</p>
                <div className="grid grid-cols-2 gap-2">
                  <LengthField label="Width" meters={lib[t].width} system={sys} min={0.3} max={50} onCommit={(m) => updateLib(t, { width: m })} />
                  <LengthField label="Depth" meters={lib[t].depth} system={sys} min={0.3} max={50} onCommit={(m) => updateLib(t, { depth: m })} />
                </div>
              </div>
            ))}
            <button className={btn} onClick={() => { const d = defaultLibrary(); setLib(d); saveLibrary(d); }}>Restore original sizes</button>
          </div>
        </details>
      </section>

      <section aria-labelledby="sched-h">
        <h2 id="sched-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Room schedule · {floor.name}</h2>
        {floor.rooms.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-300 p-3 text-xs text-ink-500">No rooms yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="pb-1 font-medium">Room</th>
                <th className="pb-1 font-medium">Size</th>
                <th className="pb-1 text-right font-medium">Area</th>
              </tr>
            </thead>
            <tbody>
              {floor.rooms.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => ws.select({ kind: "room", id: r.id })}
                  className={`cursor-pointer border-t border-ink-100 ${selection?.kind === "room" && selection.id === r.id ? "bg-brand-50" : "hover:bg-ink-50"}`}
                >
                  <td className="py-1 pr-1">{r.name}</td>
                  <td className="py-1 pr-1 text-ink-600">{isValidRect(r) ? `${formatLength(r.width, sys)} × ${formatLength(r.depth, sys)}` : "invalid"}</td>
                  <td className="py-1 text-right">{isValidRect(r) ? formatArea(r.width * r.depth, sys) : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-300 font-semibold">
                <td className="pt-1" colSpan={2}>Total room area</td>
                <td className="pt-1 text-right">{formatArea(totalRoomArea(floor), sys)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {project.floors.length > 1 && (
        <section aria-labelledby="foot-h">
          <h2 id="foot-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Footprint by floor</h2>
          <table className="w-full text-xs">
            <tbody>
              {project.floors.map((f, i) => {
                const a = totalRoomArea(f);
                const prev = i > 0 ? totalRoomArea(project.floors[i - 1]) : null;
                return (
                  <tr key={f.id} className="border-t border-ink-100">
                    <td className="py-1">{f.name}</td>
                    <td className="py-1 text-right">{formatArea(a, sys)}</td>
                    <td className="py-1 text-right text-ink-500">{prev ? `${a - prev >= 0 ? "+" : ""}${formatArea(a - prev, sys)}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
