import { csvRow, round2, uid } from "./common";

export interface Contract { id: string; contractor: string; trade: string; scope: string; value: number; retentionPct: number; advancePct: number; }
export interface Variation { id: string; contractId: string; description: string; amount: number; approved: boolean }
/** A progress claim states CUMULATIVE percent complete at a date. */
export interface Claim { id: string; contractId: string; date: string; cumulativePct: number; note: string }
export interface Payment { id: string; contractId: string; date: string; amount: number; kind: "advance" | "progress" | "retention release" | "other"; note: string }
export interface FinanceData { budget: number | null; contracts: Contract[]; variations: Variation[]; claims: Claim[]; payments: Payment[] }
export const EMPTY_FIN: FinanceData = { budget: null, contracts: [], variations: [], claims: [], payments: [] };

export const newContract = (): Contract => ({ id: uid("ct"), contractor: "", trade: "", scope: "", value: 0, retentionPct: 5, advancePct: 0 });
export const newVariation = (contractId: string): Variation => ({ id: uid("vo"), contractId, description: "", amount: 0, approved: false });
export const newClaim = (contractId: string, date: string, pct: number): Claim => ({ id: uid("cl"), contractId, date, cumulativePct: pct, note: "" });
export const newPayment = (contractId: string, date: string, amount: number, kind: Payment["kind"] = "progress"): Payment => ({ id: uid("pay"), contractId, date, amount, kind, note: "" });

export interface ClaimLine { claim: Claim; earned: number; retention: number; advanceRecovery: number; netCumulative: number; thisCertificate: number }
export interface ContractStatement {
  contract: Contract; revisedValue: number; approvedVariations: number; pendingVariations: number;
  lines: ClaimLine[]; certifiedNet: number; paid: number; advancePaid: number; retentionHeld: number; balanceDue: number; remainingToPay: number; overpaid: boolean; percent: number;
}
const clampPct = (v: number) => Math.min(100, Math.max(0, isFinite(v) ? v : 0));

/**
 * Certificate arithmetic, simple and transparent:
 *   earned        = revised value x cumulative % complete
 *   retention     = earned x retention %
 *   advance recovery = advance paid x cumulative % complete  (recovered pro rata with progress)
 *   net cumulative = earned - retention - advance recovery
 *   this certificate = net cumulative - previous net cumulative
 * Taxes and the contract's own terms are NOT applied; follow the signed contract.
 */
export function contractStatement(d: FinanceData, c: Contract): ContractStatement {
  const vars = d.variations.filter((v) => v.contractId === c.id);
  const approved = vars.filter((v) => v.approved).reduce((s, v) => s + v.amount, 0);
  const pending = vars.filter((v) => !v.approved).reduce((s, v) => s + v.amount, 0);
  const revised = c.value + approved;
  const pays = d.payments.filter((p) => p.contractId === c.id);
  const advancePaid = pays.filter((p) => p.kind === "advance").reduce((s, p) => s + p.amount, 0);
  const claims = d.claims.filter((x) => x.contractId === c.id).slice().sort((a, b) => a.date.localeCompare(b.date) || a.cumulativePct - b.cumulativePct);
  const lines: ClaimLine[] = [];
  let prevNet = 0;
  for (const cl of claims) {
    const pct = clampPct(cl.cumulativePct) / 100;
    const earned = revised * pct, retention = earned * (c.retentionPct / 100), rec = Math.min(advancePaid * pct, earned - retention);
    const net = earned - retention - rec;
    lines.push({ claim: cl, earned: round2(earned), retention: round2(retention), advanceRecovery: round2(rec), netCumulative: round2(net), thisCertificate: round2(net - prevNet) });
    prevNet = net;
  }
  const last = lines[lines.length - 1];
  const certifiedNet = last?.netCumulative ?? 0;
  const paid = pays.reduce((s, p) => s + p.amount, 0);
  const released = pays.filter((p) => p.kind === "retention release").reduce((s, p) => s + p.amount, 0);
  const retentionHeld = Math.max(0, (last?.retention ?? 0) - released);
  // paid includes the advance, which is recovered through certificates; so compare paid with certified net + advance
  const balanceDue = round2(certifiedNet + advancePaid + released - paid);
  return {
    contract: c, revisedValue: round2(revised), approvedVariations: round2(approved), pendingVariations: round2(pending), lines,
    certifiedNet: round2(certifiedNet), paid: round2(paid), advancePaid: round2(advancePaid), retentionHeld: round2(retentionHeld),
    balanceDue, remainingToPay: round2(Math.max(0, revised - paid)), overpaid: balanceDue < -0.005, percent: (last ? clampPct(last.claim.cumulativePct) : 0),
  };
}

export interface FinanceSummary {
  budget: number | null; committed: number; paid: number; retentionHeld: number; certifiedUnpaid: number; pendingVariations: number;
  procurementCommitted: number; totalCommitted: number; budgetRemaining: number | null; overBudget: boolean; forecastFinal: number; statements: ContractStatement[]; warnings: string[];
}
/** Roll up all contracts and procurement against the budget. Forecast final cost = revised contracts + pending variations + procurement. */
export function financeSummary(d: FinanceData, procurementCommitted = 0): FinanceSummary {
  const statements = d.contracts.map((c) => contractStatement(d, c));
  const committed = statements.reduce((s, x) => s + x.revisedValue, 0);
  const pendingVar = statements.reduce((s, x) => s + x.pendingVariations, 0);
  const total = committed + procurementCommitted;
  const warnings: string[] = [];
  for (const s of statements) {
    if (s.overpaid) warnings.push(`${s.contract.contractor || "Contract"}: paid more than certified (${Math.abs(s.balanceDue).toLocaleString("en-US")} ahead).`);
    if (s.paid > s.revisedValue + 0.005) warnings.push(`${s.contract.contractor || "Contract"}: payments exceed the contract value.`);
  }
  const budget = d.budget != null && d.budget > 0 ? d.budget : null;
  const forecast = total + pendingVar;
  if (budget != null && forecast > budget) warnings.push("Forecast cost (including pending variations) is above the budget.");
  return {
    budget, committed: round2(committed), paid: round2(statements.reduce((s, x) => s + x.paid, 0)), retentionHeld: round2(statements.reduce((s, x) => s + x.retentionHeld, 0)),
    certifiedUnpaid: round2(statements.reduce((s, x) => s + Math.max(0, x.balanceDue), 0)), pendingVariations: round2(pendingVar), procurementCommitted: round2(procurementCommitted), totalCommitted: round2(total),
    budgetRemaining: budget != null ? round2(budget - total) : null, overBudget: budget != null && total > budget, forecastFinal: round2(forecast), statements, warnings,
  };
}

export function paymentsCsv(d: FinanceData): string {
  const name = (id: string) => d.contracts.find((c) => c.id === id)?.contractor ?? "";
  return ["# Contractor payments (record only; follow your signed contracts and tax rules)", csvRow(["Date", "Contractor", "Kind", "Amount", "Note"]), ...d.payments.slice().sort((a, b) => a.date.localeCompare(b.date)).map((p) => csvRow([p.date, name(p.contractId), p.kind, p.amount, p.note]))].join("\n");
}
