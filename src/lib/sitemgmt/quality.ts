import { csvRow, daysBetween, todayIso, uid } from "./common";

export type Result = "pass" | "fail" | "pending";
export interface Inspection {
  id: string; date: string; stage: string; area: string; item: string; result: Result; inspector: string; note: string;
  /** snag handling for failed items */
  dueDate: string; closedDate: string;
}
export const EMPTY_QC: Inspection[] = [];

/** Generic good-practice prompts only. The governing specification and local code decide the real acceptance criteria. */
export const STAGES: Record<string, string[]> = {
  "Setting out & foundation": ["Plot boundary and setting-out verified against drawing", "Excavation depth and level as per drawing", "Founding strata checked by engineer", "Reinforcement as per structural drawing", "Concrete cover blocks in place", "Concrete cubes taken"],
  "Masonry": ["Brick/block quality and size", "Mortar mix as specified", "Wall plumb and line", "Door/window openings at correct position", "Lintels in place over openings"],
  "Slab & structure": ["Shuttering level and props", "Reinforcement spacing and cover", "Services sleeves placed before pour", "Curing started and kept up", "Concrete cubes taken"],
  "Plumbing & electrical": ["Pipes pressure tested before covering", "Slope of drains", "Conduits and boxes at correct height", "Earthing provided", "Test results recorded"],
  "Plaster & waterproofing": ["Surface prepared and wetted", "Plaster thickness and finish", "Waterproofing applied in wet areas", "Ponding test on wet areas"],
  "Finishes & handover": ["Flooring level and joints", "Doors and windows operate", "Paint finish and touch-ups", "Fixtures and fittings working", "Final clean and snag list closed"],
};

export function newInspection(stage: string, item: string): Inspection {
  return { id: uid("qc"), date: todayIso(), stage, area: "", item, result: "pending", inspector: "", note: "", dueDate: "", closedDate: "" };
}
/** Create one pending inspection per checklist item, skipping items already present for that stage and area. */
export function addChecklist(existing: Inspection[], stage: string, area: string): Inspection[] {
  const have = new Set(existing.filter((i) => i.stage === stage && i.area.trim().toLowerCase() === area.trim().toLowerCase()).map((i) => i.item));
  const added = (STAGES[stage] ?? []).filter((it) => !have.has(it)).map((it) => ({ ...newInspection(stage, it), area: area.trim() }));
  return [...existing, ...added];
}
export const isOpenSnag = (i: Inspection) => i.result === "fail" && !i.closedDate;
/** Mark a failed item fixed. Only failed items can be closed. */
export function closeSnag(i: Inspection, date: string): Inspection { return i.result === "fail" ? { ...i, closedDate: date } : i; }

export interface QcSummary {
  total: number; passed: number; failed: number; pending: number;
  passRatePct: number | null; openSnags: number; closedSnags: number; overdueSnags: number;
  byStage: Array<{ stage: string; pass: number; fail: number; pending: number; open: number }>;
}
export function qcSummary(list: Inspection[], today: string): QcSummary {
  const stages = new Map<string, { pass: number; fail: number; pending: number; open: number }>();
  let overdue = 0, open = 0, closed = 0;
  for (const i of list) {
    const s = stages.get(i.stage) ?? { pass: 0, fail: 0, pending: 0, open: 0 };
    s[i.result]++;
    if (isOpenSnag(i)) { s.open++; open++; const dd = i.dueDate ? daysBetween(i.dueDate, today) : null; if (dd != null && dd > 0) overdue++; }
    if (i.result === "fail" && i.closedDate) closed++;
    stages.set(i.stage, s);
  }
  const passed = list.filter((i) => i.result === "pass").length, failed = list.filter((i) => i.result === "fail").length;
  const decided = passed + failed;
  return { total: list.length, passed, failed, pending: list.length - decided, passRatePct: decided ? (passed / decided) * 100 : null, openSnags: open, closedSnags: closed, overdueSnags: overdue, byStage: [...stages.entries()].map(([stage, v]) => ({ stage, ...v })) };
}
export function qcCsv(list: Inspection[]): string {
  return ["# Site inspection log", csvRow(["Date", "Stage", "Area", "Item", "Result", "Inspector", "Note", "Fix due", "Closed"]), ...list.map((i) => csvRow([i.date, i.stage, i.area, i.item, i.result, i.inspector, i.note, i.dueDate, i.closedDate]))].join("\n");
}
