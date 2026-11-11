import type { Project } from "../model/types";
import { ROOM_TYPE_LABELS } from "../model/defaults";
import { addMonths, csvRow, daysBetween, uid } from "./common";

export interface Asset {
  id: string; name: string; category: string; floorId: string; roomId: string; supplier: string;
  installDate: string; warrantyMonths: number | null; serviceMonths: number | null; lastServiced: string; note: string;
}
export interface MaintLog { id: string; assetId: string; date: string; work: string; cost: number | null; by: string }
export interface TwinData { assets: Asset[]; log: MaintLog[] }
export const EMPTY_TWIN: TwinData = { assets: [], log: [] };
export type AssetStatus = "overdue" | "due soon" | "ok" | "no schedule";

export const newAsset = (name = "", category = "General"): Asset => ({ id: uid("as"), name, category, floorId: "", roomId: "", supplier: "", installDate: "", warrantyMonths: null, serviceMonths: null, lastServiced: "", note: "" });
export const newLog = (assetId: string, date: string): MaintLog => ({ id: uid("ml"), assetId, date, work: "", cost: null, by: "" });

export const warrantyEnd = (a: Asset) => (a.installDate && a.warrantyMonths != null ? addMonths(a.installDate, a.warrantyMonths) : null);
/** Next service date: last service (or install date) plus the interval. */
export function nextService(a: Asset, log: MaintLog[] = []): string | null {
  if (a.serviceMonths == null || a.serviceMonths <= 0) return null;
  const dates = [a.lastServiced, a.installDate, ...log.filter((l) => l.assetId === a.id).map((l) => l.date)].filter((d) => d && !isNaN(Date.parse(d))).sort();
  const base = dates[dates.length - 1];
  return base ? addMonths(base, a.serviceMonths) : null;
}
export function assetStatus(a: Asset, log: MaintLog[], today: string, soonDays = 30): AssetStatus {
  const n = nextService(a, log);
  if (!n) return "no schedule";
  const d = daysBetween(today, n);
  if (d == null) return "no schedule";
  return d < 0 ? "overdue" : d <= soonDays ? "due soon" : "ok";
}
export function underWarranty(a: Asset, today: string): boolean { const w = warrantyEnd(a); const d = w ? daysBetween(today, w) : null; return d != null && d >= 0; }

/** Suggest assets implied by the model (one per relevant room). The user edits dates and schedules. */
export function seedAssets(p: Project, existing: Asset[] = []): Asset[] {
  const have = new Set(existing.map((a) => `${a.roomId}|${a.name}`));
  const out: Asset[] = [];
  const add = (name: string, category: string, floorId: string, roomId: string, months: number | null) => {
    if (have.has(`${roomId}|${name}`)) return;
    out.push({ ...newAsset(name, category), floorId, roomId, serviceMonths: months });
  };
  for (const f of p.floors) {
    for (const r of f.rooms) {
      const label = r.name || ROOM_TYPE_LABELS[r.type];
      if (r.type === "bathroom" || r.type === "toilet") { add(`${label}: water heater`, "Plumbing", f.id, r.id, 12); add(`${label}: taps and fittings`, "Plumbing", f.id, r.id, 12); }
      if (r.type === "kitchen") { add(`${label}: chimney / exhaust`, "Appliance", f.id, r.id, 6); add(`${label}: sink and taps`, "Plumbing", f.id, r.id, 12); }
      if (r.type === "lift") add(`${label}: lift`, "Lift", f.id, r.id, 1);
      if (r.type === "bedroom" || r.type === "living") add(`${label}: air conditioner`, "HVAC", f.id, r.id, 6);
    }
  }
  if (p.floors.length) add("Main distribution board", "Electrical", p.floors[0].id, "", 12);
  add("Overhead water tank", "Plumbing", p.floors[p.floors.length - 1]?.id ?? "", "", 6);
  return [...existing, ...out];
}

export function twinSummary(d: TwinData, today: string) {
  const st = { overdue: 0, "due soon": 0, ok: 0, "no schedule": 0 } as Record<AssetStatus, number>;
  for (const a of d.assets) st[assetStatus(a, d.log, today)]++;
  const upcoming = d.assets.map((a) => ({ a, next: nextService(a, d.log) })).filter((x) => x.next).sort((x, y) => (x.next as string).localeCompare(y.next as string));
  return { counts: st, upcoming, underWarranty: d.assets.filter((a) => underWarranty(a, today)).length, maintenanceCost: d.log.reduce((s, l) => s + (l.cost ?? 0), 0) };
}
export function twinCsv(d: TwinData, p: Project): string {
  const room = (a: Asset) => p.floors.find((f) => f.id === a.floorId)?.rooms.find((r) => r.id === a.roomId);
  return ["# Facility asset register", csvRow(["Asset", "Category", "Floor", "Room", "Supplier", "Installed", "Warranty ends", "Service every (months)", "Last serviced", "Next service"]),
    ...d.assets.map((a) => csvRow([a.name, a.category, p.floors.find((f) => f.id === a.floorId)?.name ?? "", room(a)?.name ?? "", a.supplier, a.installDate, warrantyEnd(a) ?? "", a.serviceMonths ?? "", a.lastServiced, nextService(a, d.log) ?? ""]))].join("\n");
}

/** Room-by-room SVG of the building where each asset is a pin, red when its service is overdue. Not a 3D live twin: no sensors are connected. */
export function twinSvg(p: Project, d: TwinData, floorIndex: number, today: string): string {
  const f = p.floors[floorIndex];
  if (!f) return "";
  const W = p.plot.width, D = p.plot.depth;
  const pad = Math.max(W, D) * 0.04, fs = Math.max(W, D) / 60;
  const col: Record<AssetStatus, string> = { overdue: "#c62828", "due soon": "#ef8f00", ok: "#2e7d32", "no schedule": "#6b7280" };
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2 + fs * 3}" font-family="sans-serif">`, `<rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${D + pad * 2 + fs * 3}" fill="#fff"/>`, `<rect x="0" y="0" width="${W}" height="${D}" fill="none" stroke="#9aa3b2" stroke-width="${fs / 8}"/>`];
  for (const r of f.rooms) {
    out.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.depth}" fill="#f6f1e6" stroke="#1f2430" stroke-width="${fs / 6}"/>`);
    out.push(`<text x="${r.x + fs / 2}" y="${r.y + fs * 1.2}" font-size="${fs}" fill="#1f2430">${(r.name || ROOM_TYPE_LABELS[r.type]).replace(/[<>&"]/g, "")}</text>`);
    const here = d.assets.filter((a) => a.roomId === r.id);
    here.forEach((a, i) => {
      const cx = r.x + fs + (i % Math.max(1, Math.floor(r.width / (fs * 1.6)))) * fs * 1.6, cy = r.y + r.depth - fs * 1.2 - Math.floor(i / Math.max(1, Math.floor(r.width / (fs * 1.6)))) * fs * 1.6;
      out.push(`<circle cx="${cx}" cy="${cy}" r="${fs * 0.6}" fill="${col[assetStatus(a, d.log, today)]}"><title>${a.name.replace(/[<>&"]/g, "")}</title></circle>`);
    });
  }
  const ly = D + pad + fs;
  (Object.keys(col) as AssetStatus[]).forEach((k, i) => out.push(`<circle cx="${i * fs * 9 + fs * 0.6}" cy="${ly}" r="${fs * 0.5}" fill="${col[k]}"/><text x="${i * fs * 9 + fs * 1.4}" y="${ly + fs * 0.35}" font-size="${fs}" fill="#1f2430">${k}</text>`));
  out.push("</svg>");
  return out.join("");
}
