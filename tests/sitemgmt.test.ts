import { describe, expect, it } from "vitest";
import { createProject, addRoom, generateWalls } from "@/lib/model/ops";
import { newItem, newSupplier, bestQuote, placeOrder, procurementSummary, quoteComparison, purchaseOrderCsv, seedFromTakeoff, type ProcurementData } from "@/lib/sitemgmt/procurement";
import { addChecklist, closeSnag, qcSummary, qcCsv, STAGES, type Inspection } from "@/lib/sitemgmt/quality";
import { contractStatement, financeSummary, newContract, newVariation, newClaim, newPayment, type FinanceData } from "@/lib/sitemgmt/finance";
import { addMonths, daysBetween } from "@/lib/sitemgmt/common";
import { newAsset, nextService, assetStatus, warrantyEnd, underWarranty, seedAssets, twinSummary, twinSvg, twinCsv, type TwinData } from "@/lib/sitemgmt/twin";

describe("dates", () => {
  it("adds months with end-of-month clamping and counts days", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-15", 12)).toBe("2027-03-15");
    expect(addMonths("bad", 1)).toBeNull();
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });
});

describe("procurement", () => {
  it("picks the cheapest quote, ties by lead time, ignores invalid rates", () => {
    const i = newItem("Cement", "bag", 100);
    const a = newSupplier("A"), b = newSupplier("B"), c = newSupplier("C");
    i.quotes = [{ supplierId: a.id, rate: 400, leadDays: 5 }, { supplierId: b.id, rate: 380, leadDays: 7 }, { supplierId: c.id, rate: 380, leadDays: 2 }, { supplierId: a.id, rate: 0, leadDays: 1 }, { supplierId: a.id, rate: NaN, leadDays: 1 }];
    expect(bestQuote(i)?.supplierId).toBe(c.id);
    expect(bestQuote(newItem("x", "u", 1))).toBeNull();
  });
  it("tracks commitments, deliveries, late orders and savings missed", () => {
    const a = newSupplier("A"), b = newSupplier("B");
    const i = newItem("Steel", "kg", 1000);
    i.quotes = [{ supplierId: a.id, rate: 70, leadDays: 3 }, { supplierId: b.id, rate: 65, leadDays: 3 }];
    const ordered = { ...placeOrder(i, a.id, 70, "2026-10-01", 3), deliveredQty: 400 };
    expect(ordered.expectedDate).toBe("2026-10-04");
    const j = newItem("Sand", "m3", 10);
    const d: ProcurementData = { suppliers: [a, b], items: [ordered, j] };
    const s = procurementSummary(d, "2026-10-10");
    expect(s.committed).toBe(70000);
    expect(s.delivered).toBe(28000);
    expect(s.outstanding).toBe(42000);
    expect(s.potentialSaving).toBe(5000);
    expect(s.late.length).toBe(1);
    expect(s.unquoted.map((x) => x.material)).toEqual(["Sand"]);
    expect(s.bySupplier[0]).toMatchObject({ name: "A", committed: 70000 });
    expect(quoteComparison(d)[0].bestName).toBe("B");
    const po = purchaseOrderCsv(d, a.id, "P");
    expect(po).toContain("Steel");
    expect(po).toContain("70000");
    expect(po).not.toContain("Sand");
  });
  it("seeds the purchase list from the model once", () => {
    let p = createProject({ name: "P", plotWidth: 10, plotDepth: 10, unitSystem: "metric", buildingType: "house", floors: 1 });
    p = generateWalls(addRoom(p, p.floors[0].id, { type: "bedroom", x: 1, y: 1, width: 4, depth: 4 }), p.floors[0].id);
    const once = seedFromTakeoff(p);
    expect(once.length).toBeGreaterThan(0);
    expect(seedFromTakeoff(p, once).length).toBe(once.length);
    expect(once.every((x) => x.qty > 0 && x.quotes.length === 0 && x.orderRate == null)).toBe(true);
  });
});

describe("site quality", () => {
  it("adds a stage checklist without duplicating and summarises results and snags", () => {
    let l = addChecklist([], "Masonry", "Ground floor");
    expect(l.length).toBe(STAGES["Masonry"].length);
    expect(addChecklist(l, "Masonry", "ground FLOOR").length).toBe(l.length);
    l = l.map((x, i): Inspection => (i === 0 ? { ...x, result: "pass" } : i === 1 ? { ...x, result: "fail", dueDate: "2026-10-01" } : i === 2 ? { ...x, result: "fail", dueDate: "2026-12-01" } : x));
    l[2] = closeSnag(l[2], "2026-10-05");
    expect(closeSnag(l[0], "2026-10-05").closedDate).toBe("");
    const s = qcSummary(l, "2026-10-20");
    expect(s.passed).toBe(1);
    expect(s.failed).toBe(2);
    expect(s.pending).toBe(l.length - 3);
    expect(s.passRatePct).toBeCloseTo(33.33, 1);
    expect(s.openSnags).toBe(1);
    expect(s.closedSnags).toBe(1);
    expect(s.overdueSnags).toBe(1);
    expect(qcCsv(l).split("\n").length).toBe(l.length + 2);
    expect(qcSummary([], "2026-10-20").passRatePct).toBeNull();
  });
});

describe("financial control", () => {
  const mk = (): { d: FinanceData; id: string } => {
    const c = { ...newContract(), contractor: "Raju", value: 1000000, retentionPct: 5, advancePct: 10 };
    const v1 = { ...newVariation(c.id), amount: 100000, approved: true }, v2 = { ...newVariation(c.id), amount: 50000, approved: false };
    return { id: c.id, d: { budget: 1500000, contracts: [c], variations: [v1, v2], claims: [{ ...newClaim(c.id, "2026-09-01", 30) }, { ...newClaim(c.id, "2026-10-01", 60) }], payments: [newPayment(c.id, "2026-08-01", 100000, "advance")] } };
  };
  it("computes certificates with retention and pro-rata advance recovery", () => {
    const { d } = mk();
    const s = contractStatement(d, d.contracts[0]);
    expect(s.revisedValue).toBe(1100000);
    expect(s.pendingVariations).toBe(50000);
    // 30%: earned 330000, retention 16500, recovery 30000, net 283500
    expect(s.lines[0]).toMatchObject({ earned: 330000, retention: 16500, advanceRecovery: 30000, netCumulative: 283500, thisCertificate: 283500 });
    // 60%: earned 660000, retention 33000, recovery 60000, net 567000
    expect(s.lines[1]).toMatchObject({ earned: 660000, retention: 33000, advanceRecovery: 60000, netCumulative: 567000, thisCertificate: 283500 });
    expect(s.retentionHeld).toBe(33000);
    // certified net 567000 + advance already paid 100000 - paid 100000 = 567000 due
    expect(s.balanceDue).toBe(567000);
  });
  it("flags overpayment and releasing retention reduces what is held", () => {
    const { d, id } = mk();
    const over: FinanceData = { ...d, payments: [...d.payments, newPayment(id, "2026-10-02", 800000)] };
    const so = contractStatement(over, over.contracts[0]);
    expect(so.overpaid).toBe(true);
    const fs = financeSummary(over);
    expect(fs.warnings.join(" ")).toMatch(/more than certified/);
    const rel: FinanceData = { ...d, payments: [...d.payments, newPayment(id, "2026-11-01", 10000, "retention release")] };
    expect(contractStatement(rel, rel.contracts[0]).retentionHeld).toBe(23000);
  });
  it("rolls up against budget including procurement and pending variations", () => {
    const { d } = mk();
    const f = financeSummary(d, 300000);
    expect(f.totalCommitted).toBe(1400000);
    expect(f.budgetRemaining).toBe(100000);
    expect(f.overBudget).toBe(false);
    expect(f.forecastFinal).toBe(1450000);
    expect(financeSummary(d, 600000).overBudget).toBe(true);
    expect(financeSummary({ ...d, budget: null }).budgetRemaining).toBeNull();
  });
  it("clamps nonsense percentages and handles no claims", () => {
    const { d } = mk();
    const bad: FinanceData = { ...d, claims: [newClaim(d.contracts[0].id, "2026-09-01", 250)] };
    expect(contractStatement(bad, bad.contracts[0]).percent).toBe(100);
    expect(contractStatement({ ...d, claims: [] }, d.contracts[0]).certifiedNet).toBe(0);
  });
});

describe("digital twin register", () => {
  it("schedules service and warranty from dates", () => {
    const a = { ...newAsset("AC", "HVAC"), installDate: "2026-01-15", warrantyMonths: 24, serviceMonths: 6 };
    expect(warrantyEnd(a)).toBe("2028-01-15");
    expect(underWarranty(a, "2027-12-31")).toBe(true);
    expect(underWarranty(a, "2028-02-01")).toBe(false);
    expect(nextService(a)).toBe("2026-07-15");
    expect(assetStatus(a, [], "2026-07-01")).toBe("due soon");
    expect(assetStatus(a, [], "2026-06-01")).toBe("ok");
    expect(assetStatus(a, [], "2026-08-01")).toBe("overdue");
    const log = [{ id: "l", assetId: a.id, date: "2026-07-20", work: "serviced", cost: 500, by: "x" }];
    expect(nextService(a, log)).toBe("2027-01-20");
    expect(assetStatus({ ...a, serviceMonths: null }, [], "2026-08-01")).toBe("no schedule");
  });
  it("seeds assets from rooms, draws pins and exports", () => {
    let p = createProject({ name: "P", plotWidth: 10, plotDepth: 10, unitSystem: "metric", buildingType: "house", floors: 1 });
    p = addRoom(p, p.floors[0].id, { type: "kitchen", x: 1, y: 1, width: 3, depth: 3 });
    p = addRoom(p, p.floors[0].id, { type: "bathroom", x: 5, y: 1, width: 2, depth: 2 });
    const seeded = seedAssets(p);
    expect(seeded.length).toBeGreaterThan(3);
    expect(seedAssets(p, seeded).length).toBe(seeded.length);
    const d: TwinData = { assets: seeded.map((a) => ({ ...a, installDate: "2020-01-01" })), log: [] };
    const s = twinSummary(d, "2026-11-11");
    expect(s.counts.overdue).toBeGreaterThan(0);
    const svg = twinSvg(p, d, 0, "2026-11-11");
    expect(svg).toContain("<circle");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(twinCsv(d, p).split("\n").length).toBe(seeded.length + 2);
    expect(twinSvg(p, d, 9, "2026-11-11")).toBe("");
  });
});
