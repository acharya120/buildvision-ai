"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room, ValidationIssue } from "@/lib/model/types";
import { ROOM_COLORS, ROOM_TYPE_LABELS, makeRoom } from "@/lib/model/defaults";
import {
  MIN_ROOM_EDGE,
  addDimension,
  addOpeningNear,
  addRoom,
  addWall,
  generateWalls,
  getFloor,
  updateRoom,
} from "@/lib/model/ops";
import { M_PER_FT, formatArea, formatLength } from "@/lib/model/units";
import { isValidRect, snapValue } from "@/lib/geometry/rect";
import { openingGeometry, wallPolygon } from "@/lib/geometry/walls";
import { useWorkspace, type Tool } from "@/lib/state/store";
import { loadLibrary } from "@/lib/storage/roomLibrary";
import { btn } from "../ui/Field";

interface View {
  tx: number;
  ty: number;
  scale: number; // pixels per metre
}

type Drag =
  | { kind: "pan"; px: number; py: number; tx: number; ty: number }
  | { kind: "move"; roomId: string; offX: number; offY: number }
  | { kind: "resize"; roomId: string; corner: number; start: Room };

const TOOLS: Array<{ id: Tool; label: string; hint: string }> = [
  { id: "select", label: "Select", hint: "Click to select. Drag a room to move it, drag its corner squares to resize. Drag empty space to pan." },
  { id: "room", label: "Add room", hint: "Choose a room type in the left panel, then click the plan to place it (top-left corner at the click)." },
  { id: "wall", label: "Draw wall", hint: "Click the start point, then the end point. Press Esc to cancel." },
  { id: "door", label: "Add door", hint: "Click on a wall to place a door. Walls come from 'Generate walls' or the wall tool." },
  { id: "window", label: "Add window", hint: "Click on a wall to place a window." },
  { id: "dimension", label: "Dimension", hint: "Click two points to add a measured dimension line." },
  { id: "pan", label: "Pan", hint: "Drag to move the view. (Mouse wheel zooms.)" },
];

const corners = (r: { x: number; y: number; width: number; depth: number }) => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.depth },
  { x: r.x, y: r.y + r.depth },
];

export default function PlanEditor({ issues }: { issues: ValidationIssue[] }) {
  const ws = useWorkspace();
  const { project, activeFloorId, selection, tool, roomType } = ws.state;
  const floor = getFloor(project, activeFloorId) ?? project.floors[0];
  const floorIndex = project.floors.findIndex((f) => f.id === floor.id);
  const below = floorIndex > 0 ? project.floors[floorIndex - 1] : null;
  const sys = project.unitSystem;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ tx: 40, ty: 40, scale: 20 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef(false);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ roomId: string; rect: { x: number; y: number; width: number; depth: number } } | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [showBelow, setShowBelow] = useState(true);

  const fit = useCallback(() => {
    if (size.w < 50 || size.h < 50) return;
    const pad = 60;
    const scale = Math.max(2, Math.min((size.w - pad * 2) / project.plot.width, (size.h - pad * 2) / project.plot.depth));
    setView({ scale, tx: (size.w - project.plot.width * scale) / 2, ty: (size.h - project.plot.depth * scale) / 2 });
  }, [size.w, size.h, project.plot.width, project.plot.depth]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fitted.current && size.w > 50 && size.h > 50) {
      fitted.current = true;
      fit();
    }
  }, [size, fit]);

  // wheel zoom must be a non-passive native listener to be able to prevent page scroll
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const scale = Math.min(300, Math.max(2, v.scale * factor));
      const f = scale / v.scale;
      setView({ scale, tx: mx - (mx - v.tx) * f, ty: my - (my - v.ty) * f });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    setPending(null);
  }, [tool, activeFloorId]);

  const zoomBy = (factor: number) => {
    const v = viewRef.current;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const scale = Math.min(300, Math.max(2, v.scale * factor));
    const f = scale / v.scale;
    setView({ scale, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f });
  };

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.tx) / v.scale, y: (clientY - rect.top - v.ty) / v.scale };
  };
  const snap = (v: number) => (project.settings.snap ? snapValue(v, project.settings.gridStep) : v);
  const snapPt = (p: { x: number; y: number }) => ({ x: snap(p.x), y: snap(p.y) });

  const issueIds = useMemo(() => {
    const map = new Map<string, "error" | "warning">();
    for (const i of issues) {
      if (i.floorId !== floor.id || !i.elementId) continue;
      if (i.severity === "error") map.set(i.elementId, "error");
      else if (i.severity === "warning" && !map.has(i.elementId)) map.set(i.elementId, "warning");
    }
    return map;
  }, [issues, floor.id]);

  /* ---------- pointer interaction ---------- */

  const startDrag = (drag: Drag, e: React.PointerEvent) => {
    dragRef.current = drag;
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || tool === "pan" || tool === "select") {
      if (tool === "select" && e.button === 0) ws.select(null);
      startDrag({ kind: "pan", px: e.clientX, py: e.clientY, tx: view.tx, ty: view.ty }, e);
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    const p = snapPt(w);
    const current = ws.getState().project;

    if (tool === "room") {
      const proto = makeRoom(roomType, 0, 0, loadLibrary()[roomType]);
      const maxX = Math.max(0, current.plot.width - proto.width);
      const maxY = Math.max(0, current.plot.depth - proto.depth);
      const room = { ...proto, x: Math.min(Math.max(0, p.x), maxX), y: Math.min(Math.max(0, p.y), maxY) };
      ws.commit(addRoom(current, floor.id, room));
      ws.setTool("select"); // one click = one room; avoids accidental duplicates
      ws.select({ kind: "room", id: room.id });
      ws.notify(`Added "${room.name}". Drag it into place or edit its size on the right. Pick the room type again to add another. Use "Generate walls" when the layout is ready.`);
    } else if (tool === "wall") {
      if (!pending) setPending(p);
      else if (Math.hypot(p.x - pending.x, p.y - pending.y) > 0.05) {
        const res = addWall(current, floor.id, pending.x, pending.y, p.x, p.y);
        ws.commit(res.project);
        ws.select({ kind: "wall", id: res.id });
        setPending(null);
      }
    } else if (tool === "dimension") {
      if (!pending) setPending(p);
      else if (Math.hypot(p.x - pending.x, p.y - pending.y) > 0.05) {
        const res = addDimension(current, floor.id, pending.x, pending.y, p.x, p.y);
        ws.commit(res.project);
        ws.select({ kind: "dimension", id: res.id });
        setPending(null);
      }
    } else if (tool === "door" || tool === "window") {
      const res = addOpeningNear(current, floor.id, tool, w.x, w.y, Math.max(0.2, 14 / viewRef.current.scale));
      if ("error" in res) ws.notify(res.error, "error");
      else {
        ws.commit(res.project);
        ws.select({ kind: "opening", id: res.id });
      }
    }
  };

  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const w = toWorld(e.clientX, e.clientY);
    setCursor(w);
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView({ ...viewRef.current, tx: d.tx + (e.clientX - d.px), ty: d.ty + (e.clientY - d.py) });
    } else if (d.kind === "move") {
      const r = floor.rooms.find((q) => q.id === d.roomId);
      if (r) setPreview({ roomId: r.id, rect: { x: snap(w.x - d.offX), y: snap(w.y - d.offY), width: r.width, depth: r.depth } });
    } else if (d.kind === "resize") {
      const s = d.start;
      const cs = corners(s);
      const fixed = cs[(d.corner + 2) % 4];
      const p = snapPt(w);
      let x1 = Math.min(fixed.x, p.x);
      let x2 = Math.max(fixed.x, p.x);
      let y1 = Math.min(fixed.y, p.y);
      let y2 = Math.max(fixed.y, p.y);
      if (x2 - x1 < MIN_ROOM_EDGE) {
        if (p.x < fixed.x) x1 = x2 - MIN_ROOM_EDGE;
        else x2 = x1 + MIN_ROOM_EDGE;
      }
      if (y2 - y1 < MIN_ROOM_EDGE) {
        if (p.y < fixed.y) y1 = y2 - MIN_ROOM_EDGE;
        else y2 = y1 + MIN_ROOM_EDGE;
      }
      setPreview({ roomId: s.id, rect: { x: x1, y: y1, width: x2 - x1, depth: y2 - y1 } });
    }
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (d && d.kind !== "pan" && preview) {
      const r = floor.rooms.find((q) => q.id === preview.roomId);
      const p = preview.rect;
      if (r && (Math.abs(r.x - p.x) > 1e-6 || Math.abs(r.y - p.y) > 1e-6 || Math.abs(r.width - p.width) > 1e-6 || Math.abs(r.depth - p.depth) > 1e-6)) {
        ws.commit(updateRoom(ws.getState().project, floor.id, r.id, p));
      }
    }
    setPreview(null);
  };

  /* ---------- rendering ---------- */

  const s = view.scale;
  const px = (n: number) => n / s; // screen pixels -> world units
  const gridStep = sys === "metric" ? 1 : M_PER_FT;
  const hint = TOOLS.find((t) => t.id === tool)?.hint ?? "";

  const rooms = floor.rooms.map((r) => (preview && preview.roomId === r.id ? { ...r, ...preview.rect } : r));

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-200 bg-white p-2" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`${btn} ${tool === t.id ? "!border-brand-600 !bg-brand-50 !text-brand-700" : ""}`}
            aria-pressed={tool === t.id}
            onClick={() => ws.setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" />
        <button className={btn} onClick={() => zoomBy(1.25)} aria-label="Zoom in">＋</button>
        <button className={btn} onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button className={btn} onClick={fit}>Fit</button>
        <span className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" />
        <button className={btn} onClick={ws.undo} disabled={!ws.canUndo} aria-label="Undo">↶ Undo</button>
        <button className={btn} onClick={ws.redo} disabled={!ws.canRedo} aria-label="Redo">↷ Redo</button>
        <button
          className={btn}
          title="Create or refresh walls along room edges. Doors and windows are kept where possible; walls you drew yourself are kept."
          onClick={() => {
            ws.commit(generateWalls(ws.getState().project, floor.id));
            ws.notify("Walls generated from room edges.");
          }}
        >
          Generate walls
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50 px-3 py-1 text-xs text-ink-600">
        {project.floors.map((f) => (
          <button
            key={f.id}
            onClick={() => ws.setActiveFloor(f.id)}
            className={`rounded px-2 py-0.5 ${f.id === floor.id ? "bg-ink-800 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-100"}`}
          >
            {f.name}
          </button>
        ))}
        {below && (
          <label className="ml-2 flex items-center gap-1">
            <input type="checkbox" checked={showBelow} onChange={(e) => setShowBelow(e.target.checked)} /> show floor below (dashed)
          </label>
        )}
        <span className="ml-auto" aria-live="polite">
          {cursor ? `x ${formatLength(cursor.x, sys)}, y ${formatLength(cursor.y, sys)}` : ""}
        </span>
      </div>

      {ws.state.notice && (
        <div
          role={ws.state.notice.kind === "error" ? "alert" : "status"}
          className={`flex items-start justify-between gap-2 px-3 py-1.5 text-xs ${ws.state.notice.kind === "error" ? "bg-red-50 text-red-800" : "bg-brand-50 text-brand-700"}`}
        >
          <span>{ws.state.notice.text}</span>
          <button className="font-semibold underline" onClick={ws.clearNotice}>Dismiss</button>
        </div>
      )}

      <div ref={wrapRef} className="relative min-h-0 flex-1 bg-white">
        <svg
          ref={svgRef}
          className="no-select absolute inset-0 h-full w-full"
          style={{ cursor: tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair" }}
          role="img"
          aria-label={`Floor plan of ${floor.name}. ${floor.rooms.length} rooms.`}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <defs>
            <pattern id="grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
              <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#dfe3ea" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </pattern>
          </defs>
          <g transform={`translate(${view.tx} ${view.ty}) scale(${s})`}>
            <rect x={0} y={0} width={project.plot.width} height={project.plot.depth} fill="url(#grid)" />
            <rect x={0} y={0} width={project.plot.width} height={project.plot.depth} fill="none" stroke="#c0392b" strokeWidth={1.5} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />
            <text x={0} y={-px(8)} fontSize={px(11)} fill="#c0392b">
              Plot {formatLength(project.plot.width, sys)} × {formatLength(project.plot.depth, sys)}
            </text>

            {below && showBelow &&
              below.rooms.filter(isValidRect).map((r) => (
                <rect key={`g${r.id}`} x={r.x} y={r.y} width={r.width} height={r.depth} fill="none" stroke="#8892a6" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
              ))}

            {rooms.map((r) => {
              const ok = isValidRect(r);
              const sel = selection?.kind === "room" && selection.id === r.id;
              const issue = issueIds.get(r.id);
              return (
                <g key={r.id}>
                  <rect
                    x={r.x}
                    y={r.y}
                    width={Math.max(0, r.width)}
                    height={Math.max(0, r.depth)}
                    fill={ROOM_COLORS[r.type]}
                    fillOpacity={0.85}
                    stroke={issue === "error" ? "#d62828" : sel ? "#178263" : "#6b7280"}
                    strokeWidth={sel || issue ? 2.5 : 1}
                    strokeDasharray={issue === "error" ? "6 3" : undefined}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: tool === "select" ? "move" : undefined }}
                    onPointerDown={(e) => {
                      if (tool !== "select" || e.button !== 0) return;
                      e.stopPropagation();
                      ws.select({ kind: "room", id: r.id });
                      const w = toWorld(e.clientX, e.clientY);
                      startDrag({ kind: "move", roomId: r.id, offX: w.x - r.x, offY: w.y - r.y }, e);
                    }}
                  />
                  {ok && r.width * s > 54 && r.depth * s > 34 && (
                    <g pointerEvents="none" fontSize={px(12)} textAnchor="middle" fill="#1f2430">
                      <text x={r.x + r.width / 2} y={r.y + r.depth / 2 - px(6)} fontWeight="bold">{r.name}</text>
                      <text x={r.x + r.width / 2} y={r.y + r.depth / 2 + px(8)} fontSize={px(10.5)} fill="#3b4252">
                        {formatLength(r.width, sys)} × {formatLength(r.depth, sys)}
                      </text>
                      <text x={r.x + r.width / 2} y={r.y + r.depth / 2 + px(21)} fontSize={px(10.5)} fill="#3b4252">{formatArea(r.width * r.depth, sys)}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {floor.walls.map((w) => {
              const pts = wallPolygon(w).map((q) => `${q.x},${q.y}`).join(" ");
              const sel = selection?.kind === "wall" && selection.id === w.id;
              return (
                <g key={w.id}>
                  <polygon points={pts} fill={sel ? "#178263" : "#2b2f3a"} pointerEvents="none" />
                  <line
                    x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
                    stroke="#000" strokeOpacity={0} strokeWidth={Math.max(w.thickness, px(12))}
                    pointerEvents={tool === "select" ? "stroke" : "none"}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      if (tool !== "select" || e.button !== 0) return;
                      e.stopPropagation();
                      ws.select({ kind: "wall", id: w.id });
                    }}
                  />
                </g>
              );
            })}

            {floor.openings.map((o) => {
              const w = floor.walls.find((q) => q.id === o.wallId);
              if (!w) return null;
              const g = openingGeometry(w, o);
              const sel = selection?.kind === "opening" && selection.id === o.id;
              const t = Math.max(w.thickness, px(4));
              const leaf = { x: g.p0.x + g.normal.x * o.width, y: g.p0.y + g.normal.y * o.width };
              return (
                <g key={o.id}>
                  <line x1={g.p0.x} y1={g.p0.y} x2={g.p1.x} y2={g.p1.y} stroke="#fff" strokeWidth={t + px(1)} pointerEvents="none" />
                  {o.kind === "door" ? (
                    <>
                      <line x1={g.p0.x} y1={g.p0.y} x2={leaf.x} y2={leaf.y} stroke={sel ? "#d97706" : "#2b2f3a"} strokeWidth={px(sel ? 2.5 : 1.5)} pointerEvents="none" />
                      <path d={`M ${leaf.x} ${leaf.y} A ${o.width} ${o.width} 0 0 1 ${g.p1.x} ${g.p1.y}`} fill="none" stroke={sel ? "#d97706" : "#2b2f3a"} strokeWidth={px(1)} pointerEvents="none" />
                    </>
                  ) : (
                    <line x1={g.p0.x} y1={g.p0.y} x2={g.p1.x} y2={g.p1.y} stroke={sel ? "#d97706" : "#2b6cb0"} strokeWidth={Math.max(px(2), t * 0.4)} pointerEvents="none" />
                  )}
                  <line
                    x1={g.p0.x} y1={g.p0.y} x2={g.p1.x} y2={g.p1.y}
                    stroke="#000" strokeOpacity={0} strokeWidth={Math.max(t, px(14))}
                    pointerEvents={tool === "select" ? "stroke" : "none"}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      if (tool !== "select" || e.button !== 0) return;
                      e.stopPropagation();
                      ws.select({ kind: "opening", id: o.id });
                    }}
                  />
                </g>
              );
            })}

            {floor.dimensions.map((d) => {
              const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
              const sel = selection?.kind === "dimension" && selection.id === d.id;
              const mx = (d.x1 + d.x2) / 2;
              const my = (d.y1 + d.y2) / 2;
              return (
                <g key={d.id} stroke={sel ? "#d97706" : "#7a3d00"} fill={sel ? "#d97706" : "#7a3d00"}>
                  <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  <circle cx={d.x1} cy={d.y1} r={px(3)} stroke="none" />
                  <circle cx={d.x2} cy={d.y2} r={px(3)} stroke="none" />
                  <text x={mx} y={my - px(5)} fontSize={px(11)} textAnchor="middle" stroke="none">{formatLength(len, sys)}</text>
                  <line
                    x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2}
                    strokeOpacity={0} strokeWidth={px(14)}
                    pointerEvents={tool === "select" ? "stroke" : "none"}
                    onPointerDown={(e) => {
                      if (tool !== "select" || e.button !== 0) return;
                      e.stopPropagation();
                      ws.select({ kind: "dimension", id: d.id });
                    }}
                  />
                </g>
              );
            })}

            {selection?.kind === "room" && tool === "select" && (() => {
              const r = rooms.find((q) => q.id === selection.id);
              if (!r || !isValidRect(r)) return null;
              return corners(r).map((c, i) => (
                <rect
                  key={i}
                  x={c.x - px(5)}
                  y={c.y - px(5)}
                  width={px(10)}
                  height={px(10)}
                  fill="#fff"
                  stroke="#178263"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: i % 2 === 0 ? "nwse-resize" : "nesw-resize" }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    const start = floor.rooms.find((q) => q.id === r.id);
                    if (start) startDrag({ kind: "resize", roomId: r.id, corner: i, start }, e);
                  }}
                />
              ));
            })()}

            {pending && cursor && (tool === "wall" || tool === "dimension") && (
              <g pointerEvents="none">
                <line x1={pending.x} y1={pending.y} x2={snap(cursor.x)} y2={snap(cursor.y)} stroke="#178263" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                <text x={(pending.x + snap(cursor.x)) / 2} y={(pending.y + snap(cursor.y)) / 2 - px(6)} fontSize={px(11)} textAnchor="middle" fill="#178263">
                  {formatLength(Math.hypot(snap(cursor.x) - pending.x, snap(cursor.y) - pending.y), sys)}
                </text>
              </g>
            )}
          </g>
        </svg>
        {floor.rooms.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit max-w-sm rounded-md bg-white/90 p-3 text-center text-sm text-ink-600 shadow">
            This floor is empty. Pick <strong>Add room</strong>, choose a room type on the left, and click inside the dashed plot boundary.
          </div>
        )}
      </div>
      <p className="border-t border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-500">
        <strong>{TOOLS.find((t) => t.id === tool)?.label}:</strong> {hint}
        {tool === "room" && <> Current type: <strong>{ROOM_TYPE_LABELS[roomType]}</strong>.</>}
      </p>
    </div>
  );
}
