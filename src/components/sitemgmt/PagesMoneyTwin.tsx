"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/state/store";
import { useStored } from "@/lib/analysis/useStored";
import { buildEstimate } from "@/lib/estimate/estimate";
import { downloadText, safeFileName } from "@/lib/export/download";
import { todayIso } from "@/lib/sitemgmt/common";
import { EMPTY_PROC, procurementSummary, type ProcurementData } from "@/lib/sitemgmt/procurement";
import { EMPTY_FIN, contractStatement, financeSummary, newClaim, newContract, newPayment, newVariation, paymentsCsv, type FinanceData, type Payment } from "@/lib/sitemgmt/finance";
import { EMPTY_TWIN, assetStatus, nextService, newAsset, newLog, seedAssets, twinCsv, twinSummary, twinSvg, warrantyEnd, type Asset, type TwinData } from "@/lib/sitemgmt/twin";
import { btn, btnDanger, btnPrimary } from "../ui/Field";
import { Card, Chip, SvgDownloads, SvgView } from "../studio/shared";
import { Pill, Stat } from "../analysis/common";
import { Num, Sel, Txt, fmt } from "./ui";

const KINDS: Array<[Payment["kind"], string]> = [["progress", "Progress payment"], ["advance", "Advance"], ["retention release", "Retention release"], ["other", "Other"]];

export function FinancePage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [d, setD] = useStored<FinanceData>(project.id, "fin", EMPTY_FIN);
  const [proc] = useStored<ProcurementData>(project.id, "proc", EMPTY_PROC);
  const today = todayIso();
  const procCommitted = useMemo(() => procurementSummary(proc, today).committed, [proc, today]);
  const f = useMemo(() => financeSummary(d, procCommitted), [d, procCommitted]);
  const est = useMemo(() => buildEstimate(project), [project]);
  const upd = (id: string, patch: Partial<FinanceData["contracts"][number]>) => setD({ ...d, contracts: d.contracts.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-4">
      <Card title="Project financial control and contractor payments">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">A record and calculator, not an accounting system or legal advice. Certificates use a simple method (earned value less retention and pro-rata advance recovery); taxes, penalties and your signed contract terms are NOT applied. It records payments but does not make them.</p>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Contracts + procurement" value={fmt(f.totalCommitted)} /><Stat label="Paid to contractors" value={fmt(f.paid)} /><Stat label="Retention held" value={fmt(f.retentionHeld)} /><Stat label="Forecast final cost" value={fmt(f.forecastFinal)} tone={f.budget != null && f.forecastFinal > f.budget ? "bad" : undefined} />
          <Stat label="Budget remaining" value={f.budgetRemaining == null ? "no budget set" : fmt(f.budgetRemaining)} tone={f.overBudget ? "bad" : "good"} /><Stat label="Certified, not yet paid" value={fmt(f.certifiedUnpaid)} /><Stat label="Pending variations" value={fmt(f.pendingVariations)} /><Stat label="Procurement committed" value={fmt(f.procurementCommitted)} />
        </div>
        {f.warnings.map((w, i) => <p key={i} role="alert" className="text-sm text-red-700">{w}</p>)}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Num label="Project budget" allowEmpty value={d.budget} onChange={(v) => setD({ ...d, budget: v })} />
          {est.totalCost > 0 && <button className={btn} onClick={() => setD({ ...d, budget: Math.round(est.totalCost) })}>Use my estimate total ({fmt(est.totalCost)})</button>}
          <button className={btnPrimary} onClick={() => setD({ ...d, contracts: [...d.contracts, newContract()] })}>Add contract</button>
          {d.payments.length > 0 && <button className={btn} onClick={() => downloadText(paymentsCsv(d), `${safeFileName(project.name)}-payments.csv`, "text/csv")}>Payments (CSV)</button>}
        </div>
      </Card>
      {d.contracts.map((c) => {
        const s = contractStatement(d, c);
        const vars = d.variations.filter((v) => v.contractId === c.id), claims = s.lines, pays = d.payments.filter((p) => p.contractId === c.id);
        return (
          <Card key={c.id} title={c.contractor || "New contract"} right={<button className={btnDanger} onClick={() => { if (window.confirm("Delete this contract with its variations, claims and payments?")) setD({ ...d, contracts: d.contracts.filter((x) => x.id !== c.id), variations: d.variations.filter((x) => x.contractId !== c.id), claims: d.claims.filter((x) => x.contractId !== c.id), payments: d.payments.filter((x) => x.contractId !== c.id) }); }}>Delete</button>}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Txt label="Contractor" value={c.contractor} onChange={(v) => upd(c.id, { contractor: v })} /><Txt label="Trade" value={c.trade} onChange={(v) => upd(c.id, { trade: v })} />
              <Num label="Contract value" value={c.value} onChange={(v) => upd(c.id, { value: v ?? 0 })} /><Num label="Retention %" value={c.retentionPct} onChange={(v) => upd(c.id, { retentionPct: Math.min(100, v ?? 0) })} /><Txt label="Scope" value={c.scope} max={200} onChange={(v) => upd(c.id, { scope: v })} />
            </div>
            <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Revised value" value={fmt(s.revisedValue)} /><Stat label="% complete (last claim)" value={`${s.percent.toFixed(0)}%`} /><Stat label="Paid" value={fmt(s.paid)} /><Stat label={s.overpaid ? "Paid ahead of certificates" : "Certified, due now"} value={fmt(Math.abs(s.balanceDue))} tone={s.overpaid ? "bad" : undefined} /></div>

            <h4 className="text-xs font-semibold text-ink-700">Variations (changes in scope)</h4>
            {vars.map((v) => (<div key={v.id} className="my-1 flex flex-wrap items-end gap-2"><Txt label="Description" value={v.description} max={160} onChange={(t) => setD({ ...d, variations: d.variations.map((x) => (x.id === v.id ? { ...x, description: t } : x)) })} /><Num label="Amount (− for credit)" min={-1e12} value={v.amount} onChange={(n) => setD({ ...d, variations: d.variations.map((x) => (x.id === v.id ? { ...x, amount: n ?? 0 } : x)) })} /><label className="text-sm"><input type="checkbox" checked={v.approved} onChange={(e) => setD({ ...d, variations: d.variations.map((x) => (x.id === v.id ? { ...x, approved: e.target.checked } : x)) })} /> Approved</label><button className={btn} onClick={() => setD({ ...d, variations: d.variations.filter((x) => x.id !== v.id) })}>×</button></div>))}
            <button className={`${btn} mt-1`} onClick={() => setD({ ...d, variations: [...d.variations, newVariation(c.id)] })}>Add variation</button>

            <h4 className="mt-3 text-xs font-semibold text-ink-700">Progress claims (cumulative % complete)</h4>
            {claims.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Date</th><th>% done</th><th>Earned</th><th>Retention</th><th>Advance recovery</th><th>This certificate</th><th /></tr></thead><tbody>{claims.map((l) => <tr key={l.claim.id} className="border-t border-ink-100"><td className="py-1">{l.claim.date}</td><td>{l.claim.cumulativePct}</td><td>{fmt(l.earned)}</td><td>{fmt(l.retention)}</td><td>{fmt(l.advanceRecovery)}</td><td className="font-medium">{fmt(l.thisCertificate)}</td><td><button className={btn} onClick={() => setD({ ...d, claims: d.claims.filter((x) => x.id !== l.claim.id) })}>×</button></td></tr>)}</tbody></table></div>}
            <ClaimAdder onAdd={(date, pct) => setD({ ...d, claims: [...d.claims, newClaim(c.id, date, pct)] })} />

            <h4 className="mt-3 text-xs font-semibold text-ink-700">Payments made</h4>
            {pays.map((p) => (<div key={p.id} className="my-1 flex flex-wrap items-end gap-2"><Txt label="Date" type="date" value={p.date} onChange={(t) => setD({ ...d, payments: d.payments.map((x) => (x.id === p.id ? { ...x, date: t } : x)) })} /><Sel label="Kind" value={p.kind} options={KINDS} onChange={(k) => setD({ ...d, payments: d.payments.map((x) => (x.id === p.id ? { ...x, kind: k } : x)) })} /><Num label="Amount" value={p.amount} onChange={(n) => setD({ ...d, payments: d.payments.map((x) => (x.id === p.id ? { ...x, amount: n ?? 0 } : x)) })} /><button className={btn} onClick={() => setD({ ...d, payments: d.payments.filter((x) => x.id !== p.id) })}>×</button></div>))}
            <button className={`${btn} mt-1`} onClick={() => setD({ ...d, payments: [...d.payments, newPayment(c.id, todayIso(), 0)] })}>Record payment</button>
          </Card>
        );
      })}
    </div>
  );
}

function ClaimAdder({ onAdd }: { onAdd: (date: string, pct: number) => void }) {
  const [date, setDate] = useState(todayIso());
  const [pct, setPct] = useState("");
  const n = Number(pct);
  const ok = pct.trim() !== "" && isFinite(n) && n >= 0 && n <= 100;
  return (
    <div className="mt-1 flex flex-wrap items-end gap-2"><Txt label="Claim date" type="date" value={date} onChange={setDate} /><Txt label="Cumulative % complete (0–100)" value={pct} max={6} onChange={setPct} /><button className={btn} disabled={!ok || !date} onClick={() => { onAdd(date, n); setPct(""); }}>Add claim</button></div>
  );
}

const STATUS_TONE = { overdue: "bad", "due soon": "warn", ok: "good", "no schedule": "info" } as const;
export function TwinPage() {
  const ws = useWorkspace();
  const { project } = ws.state;
  const [d, setD] = useStored<TwinData>(project.id, "twin", EMPTY_TWIN);
  const [fi, setFi] = useState(0);
  const today = todayIso();
  const idx = Math.min(fi, project.floors.length - 1);
  const sum = useMemo(() => twinSummary(d, today), [d, today]);
  const svg = useMemo(() => twinSvg(project, d, idx, today), [project, d, idx, today]);
  const set = (id: string, patch: Partial<Asset>) => setD({ ...d, assets: d.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const rooms = project.floors.flatMap((f) => f.rooms.map((r): [string, string] => [r.id, `${f.name}: ${r.name || r.type}`]));
  return (
    <div className="space-y-4">
      <Card title="Building digital twin and facility management">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">This is an asset and maintenance register linked to your plan, with service reminders. It is not a live twin: connecting real sensors or a building management system (IoT) needs outside hardware and a paid or custom service, and is not included.</p>
        <div className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Assets" value={String(d.assets.length)} /><Stat label="Service overdue" value={String(sum.counts.overdue)} tone={sum.counts.overdue ? "bad" : "good"} /><Stat label="Due within 30 days" value={String(sum.counts["due soon"])} /><Stat label="Under warranty" value={String(sum.underWarranty)} /></div>
        <div className="flex flex-wrap gap-2"><button className={btnPrimary} onClick={() => setD({ ...d, assets: seedAssets(project, d.assets) })}>Suggest assets from my plan</button><button className={btn} onClick={() => setD({ ...d, assets: [...d.assets, newAsset("New asset")] })}>Add asset</button>{d.assets.length > 0 && <button className={btn} onClick={() => downloadText(twinCsv(d, project), `${safeFileName(project.name)}-assets.csv`, "text/csv")}>Register (CSV)</button>}</div>
        {d.assets.length > 0 && (<><div className="my-3 flex gap-1.5 overflow-x-auto">{project.floors.map((f, i) => <Chip key={f.id} active={i === idx} onClick={() => setFi(i)}>{f.name}</Chip>)}</div><SvgView svg={svg} label="Assets on the plan" /><div className="mt-3"><SvgDownloads svg={svg} base={`assets-${idx + 1}`} /></div></>)}
      </Card>
      <Card title="Asset register">
        {d.assets.length === 0 && <p className="text-sm text-ink-600">No assets yet. Use “Suggest assets from my plan”, then enter install dates and service intervals.</p>}
        <div className="space-y-3">{d.assets.map((a) => {
          const st = assetStatus(a, d.log, today), nx = nextService(a, d.log), wr = warrantyEnd(a), logs = d.log.filter((l) => l.assetId === a.id);
          return (
            <div key={a.id} className="rounded-lg border border-ink-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Txt label="Asset" value={a.name} onChange={(v) => set(a.id, { name: v })} /><Txt label="Category" value={a.category} max={40} onChange={(v) => set(a.id, { category: v })} />
                <Sel label="Location" value={a.roomId} options={[["", "Not in a room"], ...rooms]} onChange={(v) => set(a.id, { roomId: v, floorId: project.floors.find((f) => f.rooms.some((r) => r.id === v))?.id ?? a.floorId })} /><Txt label="Supplier / installer" value={a.supplier} onChange={(v) => set(a.id, { supplier: v })} />
                <Txt label="Installed" type="date" value={a.installDate} onChange={(v) => set(a.id, { installDate: v })} /><Num label="Warranty (months)" allowEmpty value={a.warrantyMonths} onChange={(v) => set(a.id, { warrantyMonths: v })} /><Num label="Service every (months)" allowEmpty value={a.serviceMonths} onChange={(v) => set(a.id, { serviceMonths: v })} /><Txt label="Last serviced" type="date" value={a.lastServiced} onChange={(v) => set(a.id, { lastServiced: v })} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><Pill tone={STATUS_TONE[st]}>{st}</Pill>{nx && <span>Next service {nx}</span>}{wr && <span className="text-ink-600">Warranty ends {wr}</span>}<button className={btn} onClick={() => setD({ ...d, log: [...d.log, newLog(a.id, today)] })}>Log maintenance</button><button className={btnDanger} onClick={() => setD({ assets: d.assets.filter((x) => x.id !== a.id), log: d.log.filter((l) => l.assetId !== a.id) })}>Delete</button></div>
              {logs.map((l) => (<div key={l.id} className="mt-1 flex flex-wrap items-end gap-2"><Txt label="Date" type="date" value={l.date} onChange={(v) => setD({ ...d, log: d.log.map((x) => (x.id === l.id ? { ...x, date: v } : x)) })} /><Txt label="Work done" value={l.work} max={200} onChange={(v) => setD({ ...d, log: d.log.map((x) => (x.id === l.id ? { ...x, work: v } : x)) })} /><Num label="Cost" allowEmpty value={l.cost} onChange={(v) => setD({ ...d, log: d.log.map((x) => (x.id === l.id ? { ...x, cost: v } : x)) })} /><button className={btn} onClick={() => setD({ ...d, log: d.log.filter((x) => x.id !== l.id) })}>×</button></div>))}
            </div>);
        })}</div>
        {sum.maintenanceCost > 0 && <p className="mt-2 text-sm">Maintenance cost logged: {fmt(sum.maintenanceCost)}</p>}
      </Card>
    </div>
  );
}
