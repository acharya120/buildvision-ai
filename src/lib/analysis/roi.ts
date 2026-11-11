export interface RoiInput {
  land: number;
  construction: number;
  /** registration, approvals, fees etc. as % of land + construction */
  otherCostPct: number;
  /** current market value of the finished property (what it would sell for today) */
  marketValue: number;
  monthlyRent: number;
  occupancyPct: number;
  /** yearly upkeep as % of the construction cost */
  maintenancePct: number;
  propertyTaxYear: number;
  appreciationPct: number;
  rentGrowthPct: number;
  years: number;
  sellingCostPct: number;
  loanAmount: number;
  loanRatePct: number;
  loanYears: number;
  discountPct: number;
}
export interface RoiResult {
  totalInvestment: number;
  equity: number;
  emi: number;
  grossYieldPct: number;
  netYieldPct: number;
  /** years of net rent to earn back the total investment (null when it never does) */
  paybackYears: number | null;
  saleValue: number;
  loanBalance: number;
  netSaleProceeds: number;
  profit: number;
  roiPct: number;
  irrLeveragedPct: number | null;
  irrUnleveragedPct: number | null;
  npv: number;
  cashFlows: Array<{ year: number; rent: number; costs: number; emi: number; net: number }>;
}

export function emiOf(principal: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (principal <= 0 || n <= 0) return 0;
  const r = ratePct / 100 / 12;
  return r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}
export function loanBalanceAfter(principal: number, ratePct: number, years: number, monthsPaid: number): number {
  const n = Math.round(years * 12);
  if (principal <= 0 || n <= 0) return 0;
  if (monthsPaid >= n) return 0;
  const r = ratePct / 100 / 12;
  if (r === 0) return principal * (1 - monthsPaid / n);
  const e = emiOf(principal, ratePct, years);
  return principal * Math.pow(1 + r, monthsPaid) - (e * (Math.pow(1 + r, monthsPaid) - 1)) / r;
}
export function irr(flows: number[]): number | null {
  const npv = (r: number) => flows.reduce((s, c, i) => s + c / Math.pow(1 + r, i), 0);
  let lo = -0.99, hi = 10;
  const a = npv(lo), b = npv(hi);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a * b > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-7) return mid;
    if (a * v < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Straightforward cash-flow model driven only by the numbers you enter. No market data is assumed. */
export function computeRoi(i: RoiInput): RoiResult {
  const years = Math.max(1, Math.min(50, Math.round(i.years)));
  const total = (i.land + i.construction) * (1 + i.otherCostPct / 100);
  const loan = Math.min(Math.max(0, i.loanAmount), total);
  const equity = total - loan;
  const emi = emiOf(loan, i.loanRatePct, i.loanYears);
  const cash: RoiResult["cashFlows"] = [];
  const unlev: number[] = [-total];
  const lev: number[] = [-equity];
  let cum = 0;
  let payback: number | null = null;
  for (let y = 1; y <= years; y++) {
    const rent = i.monthlyRent * 12 * (i.occupancyPct / 100) * Math.pow(1 + i.rentGrowthPct / 100, y - 1);
    const costs = (i.construction * i.maintenancePct) / 100 + i.propertyTaxYear;
    const pay = y <= i.loanYears ? emi * 12 : 0;
    const noi = rent - costs;
    cum += noi;
    if (payback === null && cum >= total) payback = y - (cum - total) / (noi || 1);
    cash.push({ year: y, rent, costs, emi: pay, net: noi - pay });
    unlev.push(noi);
    lev.push(noi - pay);
  }
  const sale = i.marketValue * Math.pow(1 + i.appreciationPct / 100, years);
  const bal = loanBalanceAfter(loan, i.loanRatePct, i.loanYears, years * 12);
  const net = sale * (1 - i.sellingCostPct / 100);
  unlev[years] += net;
  lev[years] += net - bal;
  const noi1 = cash[0].rent - cash[0].costs;
  const d = i.discountPct / 100;
  const npv = lev.reduce((s, c, k) => s + c / Math.pow(1 + d, k), 0);
  const x = irr(lev), u = irr(unlev);
  return {
    totalInvestment: total, equity, emi,
    grossYieldPct: total > 0 ? (cash[0].rent / total) * 100 : 0,
    netYieldPct: total > 0 ? (noi1 / total) * 100 : 0,
    paybackYears: payback, saleValue: sale, loanBalance: bal, netSaleProceeds: net - bal,
    profit: lev.reduce((s, c) => s + c, 0),
    roiPct: equity > 0 ? (lev.reduce((s, c) => s + c, 0) / equity) * 100 : 0,
    irrLeveragedPct: x == null ? null : x * 100, irrUnleveragedPct: u == null ? null : u * 100, npv, cashFlows: cash,
  };
}
