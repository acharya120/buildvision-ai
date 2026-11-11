import { newId } from "../model/ids";

export const uid = (prefix: string) => newId(prefix);
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");
export const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const round2 = (n: number) => Math.round(n * 100) / 100;
/** Days from a to b (ISO yyyy-mm-dd); null if either is invalid. */
export function daysBetween(a: string, b: string): number | null {
  const x = Date.parse(a), y = Date.parse(b);
  return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 86400000);
}
/** Add whole months to an ISO date (end of month clamped). */
export function addMonths(iso: string, months: number): string | null {
  const t = Date.parse(iso);
  if (isNaN(t) || !isFinite(months)) return null;
  const d = new Date(t);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(months));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
