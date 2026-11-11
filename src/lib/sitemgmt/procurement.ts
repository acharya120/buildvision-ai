import type { Project } from "../model/types";
import { buildTakeoff } from "../materials/takeoff";
import { csvRow, daysBetween, round2, uid } from "./common";

export interface Supplier { id: string; name: string; contact: string; phone: string; email: string; category: string; note: string }
export interface Quote { supplierId: string; rate: number; leadDays: number | null }
export type ProcStatus = "needed" | "ordered" | "delivered";
export interface PurchaseItem {
  id: string; material: string; unit: string; qty: number;
  quotes: Quote[];
  status: ProcStatus;
  /** supplier and rate actually ordered */
  supplierId: string | null; orderRate: number | null;
  orderDate: string; expectedDate: string; deliveredQty: number;
}
export interface ProcurementData { suppliers: Supplier[]; items: PurchaseItem[] }
export const EMPTY_PROC: ProcurementData = { suppliers: [], items: [] };

export function newSupplier(name = ""): Supplier { return { id: uid("sup"), name, contact: "", phone: "", email: "", category: "", note: "" }; }
export function newItem(material = "", unit = "", qty = 0): PurchaseItem {
  return { id: uid("pi"), material, unit, qty, quotes: [], status: "needed", supplierId: null, orderRate: null, orderDate: "", expectedDate: "", deliveredQty: 0 };
}

/** Purchase list from the model's material take-off. Quantities are the take-off's, rates are never invented. */
export function seedFromTakeoff(p: Project, existing: PurchaseItem[] = []): PurchaseItem[] {
  const have = new Set(existing.map((i) => i.material.toLowerCase()));
  const add = buildTakeoff(p).lines.filter((l) => l.quantity > 0 && !have.has(l.name.toLowerCase())).map((l) => newItem(l.name, l.unit, l.quantity));
  return [...existing, ...add];
}

/** Cheapest valid quote (rate > 0). Ties go to the shorter lead time. */
export function bestQuote(item: PurchaseItem): Quote | null {
  const q = item.quotes.filter((x) => isFinite(x.rate) && x.rate > 0);
  if (!q.length) return null;
  return q.reduce((a, b) => (b.rate < a.rate || (b.rate === a.rate && (b.leadDays ?? 1e9) < (a.leadDays ?? 1e9)) ? b : a));
}

/** Order an item at the given supplier and rate. */
export function placeOrder(item: PurchaseItem, supplierId: string, rate: number, orderDate: string, leadDays: number | null): PurchaseItem {
  let expected = item.expectedDate;
  if (leadDays != null && !isNaN(Date.parse(orderDate))) expected = new Date(Date.parse(orderDate) + leadDays * 86400000).toISOString().slice(0, 10);
  return { ...item, status: "ordered", supplierId, orderRate: rate, orderDate, expectedDate: expected };
}

export interface ProcSummary {
  committed: number; delivered: number; outstanding: number; potentialSaving: number;
  counts: Record<ProcStatus, number>; late: PurchaseItem[]; unquoted: PurchaseItem[];
  bySupplier: Array<{ supplierId: string; name: string; committed: number }>;
}
export function procurementSummary(d: ProcurementData, today: string): ProcSummary {
  const counts: Record<ProcStatus, number> = { needed: 0, ordered: 0, delivered: 0 };
  let committed = 0, delivered = 0, saving = 0;
  const by = new Map<string, number>();
  const late: PurchaseItem[] = [], unquoted: PurchaseItem[] = [];
  for (const i of d.items) {
    counts[i.status]++;
    const rate = i.orderRate ?? 0;
    if (i.status !== "needed" && i.orderRate != null) {
      const val = i.qty * rate;
      committed += val;
      delivered += Math.min(i.deliveredQty, i.qty) * rate;
      if (i.supplierId) by.set(i.supplierId, (by.get(i.supplierId) ?? 0) + val);
      const b = bestQuote(i);
      if (b && b.rate < rate) saving += (rate - b.rate) * i.qty;
    }
    if (i.status === "ordered" && i.expectedDate) { const dd = daysBetween(i.expectedDate, today); if (dd != null && dd > 0) late.push(i); }
    if (i.status === "needed" && !bestQuote(i)) unquoted.push(i);
  }
  return {
    committed: round2(committed), delivered: round2(delivered), outstanding: round2(committed - delivered), potentialSaving: round2(saving), counts, late, unquoted,
    bySupplier: [...by.entries()].map(([supplierId, c]) => ({ supplierId, name: d.suppliers.find((s) => s.id === supplierId)?.name ?? "(supplier removed)", committed: round2(c) })).sort((a, b) => b.committed - a.committed),
  };
}

/** Quote comparison rows: one row per item that has at least one quote. */
export function quoteComparison(d: ProcurementData) {
  return d.items.filter((i) => i.quotes.length).map((i) => {
    const b = bestQuote(i);
    return { item: i, best: b, bestName: b ? d.suppliers.find((s) => s.id === b.supplierId)?.name ?? "(removed)" : "", total: b ? round2(b.rate * i.qty) : null };
  });
}

/** Purchase order lines for one supplier, as CSV. */
export function purchaseOrderCsv(d: ProcurementData, supplierId: string, projectName: string): string {
  const s = d.suppliers.find((x) => x.id === supplierId);
  const rows = [`# Purchase order draft for ${s?.name ?? "supplier"} - project ${projectName}`, "# Draft only. Confirm quantities, rates, taxes and terms with the supplier.", csvRow(["Material", "Quantity", "Unit", "Rate", "Amount", "Expected delivery"])];
  let total = 0;
  for (const i of d.items.filter((x) => x.supplierId === supplierId && x.status !== "needed" && x.orderRate != null)) { const a = round2(i.qty * (i.orderRate ?? 0)); total += a; rows.push(csvRow([i.material, i.qty, i.unit, i.orderRate, a, i.expectedDate])); }
  rows.push(csvRow(["Total", "", "", "", round2(total), ""]));
  return rows.join("\n");
}
