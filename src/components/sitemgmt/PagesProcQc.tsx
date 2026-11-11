"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { useStored } from "@/lib/analysis/useStored";
import { downloadText, safeFileName } from "@/lib/export/download";
import { todayIso } from "@/lib/sitemgmt/common";
import { EMPTY_PROC, newItem, newSupplier, placeOrder, procurementSummary, quoteComparison, purchaseOrderCsv, seedFromTakeoff, bestQuote, type ProcurementData, type PurchaseItem, type Quote } from "@/lib/sitemgmt/procurement";
import { EMPTY_QC, STAGES, addChecklist, closeSnag, isOpenSnag, qcCsv, qcSummary, newInspection, type Inspection, type Result } from "@/lib/sitemgmt/quality";
import { btn, btnDanger, btnPrimary } from "../ui/Field";
import { Card } from "../studio/shared";
import { Pill, Stat } from "../analysis/common";
import { Bars } from "../engineering/common";
import { Num, Sel, Txt, fmt } from "./ui";

export function ProcurementPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [d, setD] = useStored<ProcurementData>(project.id, "proc", EMPTY_PROC);
  const [sel, setSel] = useState<string>("");
  const today = todayIso();
  const sum = useMemo(() => procurementSummary(d, today), [d, today]);
  const cmp = useMemo(() => quoteComparison(d), [d]);
  const setItem = (id: string, patch: Partial<PurchaseItem>) => setD({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const supName = (id: string | null) => d.suppliers.find((s) => s.id === id)?.name ?? "";
  const supOptions: Array<[string, string]> = [["", "Choose supplier…"], ...d.suppliers.map((s): [string, string] => [s.id, s.name || "(unnamed)"])];
  const orderedSuppliers = [...new Set(d.items.filter((i) => i.status !== "needed" && i.supplierId).map((i) => i.supplierId as string))];
  return (
    <div className="space-y-4">
      <Card title="Procurement, suppliers and vendors">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">A working register kept in this browser. Quantities come from your material take-off; every rate is typed by you from real quotes. Nothing is ordered or sent anywhere: purchase orders are CSV drafts.</p>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Committed" value={fmt(sum.committed)} /><Stat label="Delivered (value)" value={fmt(sum.delivered)} /><Stat label="Outstanding" value={fmt(sum.outstanding)} /><Stat label="Cheaper quotes missed" value={fmt(sum.potentialSaving)} tone={sum.potentialSaving ? "bad" : "good"} /></div>
        {sum.late.length > 0 && <p role="alert" className="text-sm text-red-700">Late deliveries: {sum.late.map((i) => i.material).join(", ")}.</p>}
        <div className="mt-2 flex flex-wrap gap-2"><button className={btnPrimary} onClick={() => setD({ ...d, items: seedFromTakeoff(project, d.items) })}>Fill purchase list from my material take-off</button><button className={btn} onClick={() => setD({ ...d, items: [...d.items, newItem("New item", "unit", 1)] })}>Add item</button></div>
      </Card>
      <Card title="Suppliers" right={<button className={btn} onClick={() => setD({ ...d, suppliers: [...d.suppliers, newSupplier("New supplier")] })}>Add supplier</button>}>
        {d.suppliers.length === 0 && <p className="text-sm text-ink-600">No suppliers yet.</p>}
        <div className="space-y-3">{d.suppliers.map((s) => (
          <div key={s.id} className="grid gap-2 rounded-lg border border-ink-200 p-2 sm:grid-cols-2 lg:grid-cols-5">
            <Txt label="Name" value={s.name} onChange={(v) => setD({ ...d, suppliers: d.suppliers.map((x) => (x.id === s.id ? { ...x, name: v } : x)) })} />
            <Txt label="Supplies" value={s.category} onChange={(v) => setD({ ...d, suppliers: d.suppliers.map((x) => (x.id === s.id ? { ...x, category: v } : x)) })} />
            <Txt label="Phone" value={s.phone} onChange={(v) => setD({ ...d, suppliers: d.suppliers.map((x) => (x.id === s.id ? { ...x, phone: v } : x)) })} />
            <Txt label="Email" value={s.email} onChange={(v) => setD({ ...d, suppliers: d.suppliers.map((x) => (x.id === s.id ? { ...x, email: v } : x)) })} />
            <button className={`${btnDanger} self-end`} onClick={() => { if (window.confirm(`Remove ${s.name || "this supplier"}? Its quotes are removed too.`)) setD({ suppliers: d.suppliers.filter((x) => x.id !== s.id), items: d.items.map((i) => ({ ...i, quotes: i.quotes.filter((q) => q.supplierId !== s.id), supplierId: i.supplierId === s.id ? null : i.supplierId })) }); }}>Remove</button>
          </div>))}</div>
      </Card>
      <Card title="Purchase list, quotes and orders">
        {d.items.length === 0 && <p className="text-sm text-ink-600">Nothing to buy yet. Fill from the take-off or add an item.</p>}
        <div className="space-y-3">{d.items.map((i) => {
          const best = bestQuote(i);
          return (
            <div key={i.id} className="rounded-lg border border-ink-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Txt label="Material" value={i.material} onChange={(v) => setItem(i.id, { material: v })} />
                <Num label="Quantity" value={i.qty} onChange={(v) => setItem(i.id, { qty: v ?? 0 })} />
                <Txt label="Unit" value={i.unit} max={20} onChange={(v) => setItem(i.id, { unit: v })} />
                <div className="self-end"><Pill tone={i.status === "delivered" ? "good" : i.status === "ordered" ? "info" : "warn"}>{i.status}</Pill>{i.status !== "needed" && i.orderRate != null && <span className="ml-2 text-xs">{supName(i.supplierId)} @ {i.orderRate}</span>}</div>
                <button className={`${btnDanger} self-end`} onClick={() => setD({ ...d, items: d.items.filter((x) => x.id !== i.id) })}>Delete</button>
              </div>
              <div className="mt-2 space-y-1">
                {i.quotes.map((q, qi) => (
                  <div key={qi} className="flex flex-wrap items-end gap-2 text-sm">
                    <Sel label="Quote from" value={q.supplierId} options={supOptions.slice(1)} onChange={(v) => setItem(i.id, { quotes: i.quotes.map((x, k) => (k === qi ? { ...x, supplierId: v } : x)) })} />
                    <Num label="Rate" value={q.rate} onChange={(v) => setItem(i.id, { quotes: i.quotes.map((x, k) => (k === qi ? { ...x, rate: v ?? 0 } : x)) })} />
                    <Num label="Lead days" allowEmpty value={q.leadDays} onChange={(v) => setItem(i.id, { quotes: i.quotes.map((x, k) => (k === qi ? { ...x, leadDays: v } : x)) })} />
                    {i.status === "needed" && q.rate > 0 && <button className={btn} onClick={() => setItem(i.id, placeOrder(i, q.supplierId, q.rate, today, q.leadDays))}>Order at this quote</button>}
                    <button className={btn} onClick={() => setItem(i.id, { quotes: i.quotes.filter((_, k) => k !== qi) })}>×</button>
                  </div>))}
                <div className="flex flex-wrap items-end gap-2">
                  <button className={btn} disabled={!d.suppliers.length} onClick={() => setItem(i.id, { quotes: [...i.quotes, { supplierId: d.suppliers[0].id, rate: 0, leadDays: null } as Quote] })}>Add quote</button>
                  {best && <span className="text-xs text-ink-600">Cheapest: {supName(best.supplierId)} @ {best.rate}</span>}
                  {i.status === "ordered" && (<><Txt label="Expected" type="date" value={i.expectedDate} onChange={(v) => setItem(i.id, { expectedDate: v })} /><Num label="Delivered qty" value={i.deliveredQty} onChange={(v) => { const q = v ?? 0; setItem(i.id, { deliveredQty: q, status: q >= i.qty ? "delivered" : "ordered" }); }} /></>)}
                  {i.status !== "needed" && <button className={btn} onClick={() => setItem(i.id, { status: "needed", supplierId: null, orderRate: null, deliveredQty: 0, orderDate: "", expectedDate: "" })}>Cancel order</button>}
                </div>
              </div>
            </div>);
        })}</div>
      </Card>
      <Card title="Compare and export">
        {cmp.length === 0 ? <p className="text-sm text-ink-600">Add quotes to compare suppliers.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Item</th><th>Quotes</th><th>Cheapest</th><th>Total at cheapest</th></tr></thead><tbody>{cmp.map((c) => <tr key={c.item.id} className="border-t border-ink-100"><td className="py-1">{c.item.material}</td><td>{c.item.quotes.length}</td><td>{c.best ? `${c.bestName} @ ${c.best.rate}` : "no valid rate"}</td><td>{c.total == null ? "" : fmt(c.total)}</td></tr>)}</tbody></table></div>)}
        <div className="mt-3"><Bars title="Committed by supplier" data={sum.bySupplier.map((b) => ({ label: b.name, value: b.committed }))} /></div>
        <div className="mt-3 flex flex-wrap items-end gap-2"><Sel label="Purchase order for" value={sel} options={[["", "Choose supplier…"], ...orderedSuppliers.map((id): [string, string] => [id, supName(id) || "(unnamed)"])]} onChange={setSel} /><button className={btn} disabled={!sel} onClick={() => downloadText(purchaseOrderCsv(d, sel, project.name), `${safeFileName(project.name)}-PO-${safeFileName(supName(sel))}.csv`, "text/csv")}>Download PO draft (CSV)</button></div>
      </Card>
    </div>
  );
}

const RES: Array<[Result, string]> = [["pending", "Pending"], ["pass", "Pass"], ["fail", "Fail"]];
export function QualityPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [list, setList] = useStored<Inspection[]>(project.id, "qc", EMPTY_QC);
  const [stage, setStage] = useState(Object.keys(STAGES)[0]);
  const [area, setArea] = useState("");
  const [filter, setFilter] = useState<"all" | "open">("all");
  const today = todayIso();
  const s = useMemo(() => qcSummary(list, today), [list, today]);
  const set = (id: string, patch: Partial<Inspection>) => setList(list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const shown = list.filter((i) => (filter === "open" ? isOpenSnag(i) : true));
  return (
    <div className="space-y-4">
      <Card title="Site inspection and quality management">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">The checklists are generic good-practice prompts, not your specification. Use your drawings, specification and local code for acceptance, and have a qualified engineer sign off structural stages. Photos are not stored yet (they need file storage, added in a later phase).</p>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Pass rate (decided)" value={s.passRatePct == null ? "n/a" : `${s.passRatePct.toFixed(0)}%`} /><Stat label="Pending" value={String(s.pending)} /><Stat label="Open snags" value={String(s.openSnags)} tone={s.openSnags ? "bad" : "good"} /><Stat label="Overdue snags" value={String(s.overdueSnags)} tone={s.overdueSnags ? "bad" : "good"} /></div>
        <div className="flex flex-wrap items-end gap-2">
          <Sel label="Stage" value={stage} options={Object.keys(STAGES).map((k): [string, string] => [k, k])} onChange={setStage} />
          <Txt label="Area (e.g. Ground floor)" value={area} onChange={setArea} />
          <button className={btnPrimary} onClick={() => setList(addChecklist(list, stage, area))}>Add checklist</button>
          <button className={btn} onClick={() => setList([...list, { ...newInspection(stage, "Custom item"), area }])}>Add one item</button>
          {list.length > 0 && <button className={btn} onClick={() => downloadText(qcCsv(list), `${safeFileName(project.name)}-inspections.csv`, "text/csv")}>Download log (CSV)</button>}
        </div>
      </Card>
      <Card title="Inspection log" right={<div className="flex gap-1.5"><button className={filter === "all" ? btnPrimary : btn} onClick={() => setFilter("all")}>All</button><button className={filter === "open" ? btnPrimary : btn} onClick={() => setFilter("open")}>Open snags</button></div>}>
        {shown.length === 0 && <p className="text-sm text-ink-600">{list.length ? "No open snags." : "No inspections yet. Add a checklist above."}</p>}
        <div className="space-y-2">{shown.map((i) => (
          <div key={i.id} className="grid gap-2 rounded-lg border border-ink-200 p-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2"><Txt label={`${i.stage}${i.area ? " · " + i.area : ""}`} value={i.item} onChange={(v) => set(i.id, { item: v })} /></div>
            <Sel label="Result" value={i.result} options={RES} onChange={(v) => set(i.id, { result: v, closedDate: v === "fail" ? i.closedDate : "" })} />
            <Txt label="Date" type="date" value={i.date} onChange={(v) => set(i.id, { date: v })} />
            <Txt label="Inspector" value={i.inspector} max={60} onChange={(v) => set(i.id, { inspector: v })} />
            <button className={`${btnDanger} self-end`} onClick={() => setList(list.filter((x) => x.id !== i.id))}>Delete</button>
            <div className="sm:col-span-2 lg:col-span-6"><Txt label="Note" value={i.note} max={300} onChange={(v) => set(i.id, { note: v })} /></div>
            {i.result === "fail" && (<div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-6"><Txt label="Fix by" type="date" value={i.dueDate} onChange={(v) => set(i.id, { dueDate: v })} />{i.closedDate ? <><Pill tone="good">Closed {i.closedDate}</Pill><button className={btn} onClick={() => set(i.id, { closedDate: "" })}>Reopen</button></> : <><Pill tone="bad">Open snag</Pill><button className={btn} onClick={() => setList(list.map((x) => (x.id === i.id ? closeSnag(x, today) : x)))}>Mark fixed</button></>}</div>)}
          </div>))}</div>
      </Card>
      {s.byStage.length > 0 && <Card title="By stage"><Bars title="Open snags per stage" data={s.byStage.map((b) => ({ label: b.stage, value: b.open }))} /><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Stage</th><th>Pass</th><th>Fail</th><th>Pending</th></tr></thead><tbody>{s.byStage.map((b) => <tr key={b.stage} className="border-t border-ink-100"><td className="py-1">{b.stage}</td><td>{b.pass}</td><td>{b.fail}</td><td>{b.pending}</td></tr>)}</tbody></table></div></Card>}
    </div>
  );
}
