"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";
import type { Project, RoomType, Selection } from "../model/types";

export type Tool = "select" | "room" | "wall" | "door" | "window" | "dimension" | "pan";

const HISTORY_LIMIT = 100;

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  activeFloorId: string;
  selection: Selection | null;
  tool: Tool;
  roomType: RoomType;
  notice: { kind: "info" | "error"; text: string } | null;
}

type Action =
  | { type: "commit"; project: Project }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "floor"; id: string }
  | { type: "select"; selection: Selection | null }
  | { type: "tool"; tool: Tool }
  | { type: "roomType"; roomType: RoomType }
  | { type: "notice"; notice: State["notice"] }
  | { type: "replace"; project: Project };

/** Keep the selection across undo/redo when the selected element still exists. */
function stillSelected(project: Project, sel: Selection | null): Selection | null {
  if (!sel) return null;
  for (const f of project.floors) {
    const list = sel.kind === "room" ? f.rooms : sel.kind === "wall" ? f.walls : sel.kind === "opening" ? f.openings : f.dimensions;
    if (list.some((e) => e.id === sel.id)) return sel;
  }
  return null;
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "commit": {
      if (a.project === s.project) return s;
      const floorStillExists = a.project.floors.some((f) => f.id === s.activeFloorId);
      return {
        ...s,
        project: a.project,
        past: [...s.past, s.project].slice(-HISTORY_LIMIT),
        future: [],
        activeFloorId: floorStillExists ? s.activeFloorId : a.project.floors[0].id,
      };
    }
    case "undo": {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return {
        ...s,
        project: prev,
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
        selection: stillSelected(prev, s.selection),
        activeFloorId: prev.floors.some((f) => f.id === s.activeFloorId) ? s.activeFloorId : prev.floors[0].id,
      };
    }
    case "redo": {
      if (!s.future.length) return s;
      const next = s.future[0];
      return {
        ...s,
        project: next,
        past: [...s.past, s.project],
        future: s.future.slice(1),
        selection: stillSelected(next, s.selection),
        activeFloorId: next.floors.some((f) => f.id === s.activeFloorId) ? s.activeFloorId : next.floors[0].id,
      };
    }
    case "floor":
      return { ...s, activeFloorId: a.id, selection: null };
    case "select":
      return { ...s, selection: a.selection };
    case "tool":
      return { ...s, tool: a.tool, notice: null };
    case "roomType":
      return { ...s, roomType: a.roomType };
    case "notice":
      return { ...s, notice: a.notice };
    case "replace":
      return { ...s, project: a.project, past: [], future: [], selection: null, activeFloorId: a.project.floors[0].id };
  }
}

export interface Workspace {
  state: State;
  /** latest state, safe to read inside event handlers that may hold stale closures */
  getState: () => State;
  commit: (project: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  setActiveFloor: (id: string) => void;
  select: (s: Selection | null) => void;
  setTool: (t: Tool) => void;
  setRoomType: (t: RoomType) => void;
  notify: (text: string, kind?: "info" | "error") => void;
  clearNotice: () => void;
  replaceProject: (p: Project) => void;
}

const Ctx = createContext<Workspace | null>(null);

export function WorkspaceProvider({ initial, children }: { initial: Project; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial, (p): State => ({
    project: p,
    past: [],
    future: [],
    activeFloorId: p.floors[0].id,
    selection: null,
    tool: "select",
    roomType: "bedroom",
    notice: null,
  }));
  const ref = useRef(state);
  ref.current = state;

  const getState = useCallback(() => ref.current, []);
  const commit = useCallback((project: Project) => dispatch({ type: "commit", project }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const setActiveFloor = useCallback((id: string) => dispatch({ type: "floor", id }), []);
  const select = useCallback((selection: Selection | null) => dispatch({ type: "select", selection }), []);
  const setTool = useCallback((tool: Tool) => dispatch({ type: "tool", tool }), []);
  const setRoomType = useCallback((roomType: RoomType) => dispatch({ type: "roomType", roomType }), []);
  const notify = useCallback((text: string, kind: "info" | "error" = "info") => dispatch({ type: "notice", notice: { kind, text } }), []);
  const clearNotice = useCallback(() => dispatch({ type: "notice", notice: null }), []);
  const replaceProject = useCallback((project: Project) => dispatch({ type: "replace", project }), []);

  const value = useMemo<Workspace>(
    () => ({
      state,
      getState,
      commit,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      setActiveFloor,
      select,
      setTool,
      setRoomType,
      notify,
      clearNotice,
      replaceProject,
    }),
    [state, getState, commit, undo, redo, setActiveFloor, select, setTool, setRoomType, notify, clearNotice, replaceProject],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}
