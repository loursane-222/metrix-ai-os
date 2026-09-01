import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  salesGoal: { findMany: vi.fn() },
  invoice: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  productionOrder: { findMany: vi.fn() },
  supplier: { findMany: vi.fn() },
  order: { count: vi.fn() },
  delivery: { count: vi.fn() },
}));

const buildCollectionsDataset = vi.hoisted(() => vi.fn());

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));
vi.mock("@/lib/artifacts/datasets/collections-dataset.service", () => ({ buildCollectionsDataset }));

vi.mock("@/lib/accounting/accounting-summary", () => ({
  getAccountingSummary: vi.fn().mockResolvedValue({
    period: { start: "2026-08-01T00:00:00.000Z", endExclusive: "2026-09-01T00:00:00.000Z" },
    metrics: {
      cashPosition: { amounts: [{ currency: "TRY", amount: 1000 }], available: true, note: "" },
      totalReceivable: { amounts: [], available: false, note: "" },
      totalPayable: { amounts: [], available: false, note: "" },
      monthlyRevenue: { amounts: [{ currency: "TRY", amount: 5000 }], available: true, note: "" },
      monthlyExpense: { amounts: [{ currency: "TRY", amount: 2000 }], available: true, note: "" },
      monthlyTaxLiability: { amounts: [], available: false, note: "" },
    },
    sourceCounts: { invoices: 1, payments: 1, expenses: 1 },
  }),
}));
vi.mock("@/lib/core/expenses", () => ({
  buildExpenseContextForOrganization: vi.fn().mockResolvedValue({ hasExpenseData: true }),
  buildExpenseIntelligence: vi.fn().mockReturnValue({ monthlyBurnRate: 2000, burnRiskLevel: "LOW", overdueRatio: 0 }),
}));
vi.mock("@/lib/core/payments/payment-context-builder", () => ({
  buildPaymentContextForOrganization: vi.fn().mockResolvedValue({ totalReceivable: 3000, totalOverdue: 0 }),
}));
vi.mock("@/lib/core/payments/payment-intelligence-builder", () => ({
  buildPaymentIntelligence: vi.fn().mockReturnValue({ cashRiskLevel: "LOW", overdueRatio: 0 }),
}));

const { buildBusinessOverview } = await import("../business-overview-synthesis.service");

describe("buildBusinessOverview", () => {
  beforeEach(() => {
    db.salesGoal.findMany.mockReset();
    db.invoice.findMany.mockReset().mockResolvedValue([]);
    db.payment.findMany.mockReset().mockResolvedValue([]);
    db.productionOrder.findMany.mockReset().mockResolvedValue([]);
    db.supplier.findMany.mockReset().mockResolvedValue([]);
    db.order.count.mockReset().mockResolvedValue(0);
    db.delivery.count.mockReset().mockResolvedValue(0);
    buildCollectionsDataset.mockReset().mockResolvedValue({
      period: { from: new Date(0), to: new Date(0), label: "", isoLabel: "" },
      records: [], recordCount: 0, totalsByCurrency: {},
    });
  });

  it("carries the org's real financial summary and health level through untouched", async () => {
    db.salesGoal.findMany.mockResolvedValue([]);
    const overview = await buildBusinessOverview("org-1");
    expect(overview.financialSummary.monthlyRevenue.amounts).toEqual([{ currency: "TRY", amount: 5000 }]);
    expect(overview.financialSummary.monthlyExpense.amounts).toEqual([{ currency: "TRY", amount: 2000 }]);
    expect(overview.financialHealthLevel).toBe("LOW");
  });

  it("marks a revenue goal BEHIND when real invoiced revenue trails the expected pace, and surfaces it as a risk", async () => {
    db.salesGoal.findMany.mockResolvedValue([{
      id: "goal-1", title: "Q3 Ciro Hedefi", currency: "TRY",
      targetRevenueCents: 100_000_00, targetCollectionCents: null, targetValue: null, actualValue: null,
      startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: new Date("2026-08-31T00:00:00Z"),
    }]);
    // Halfway through the period (Aug 16), only 10% of target invoiced — well behind the ~50% expected pace.
    db.invoice.findMany.mockResolvedValue([{ totalAmount: 10_000 }]);
    vi.setSystemTime(new Date("2026-08-16T00:00:00Z"));

    const overview = await buildBusinessOverview("org-1");

    expect(overview.goals).toHaveLength(1);
    expect(overview.goals[0]).toMatchObject({ metric: "REVENUE", actualAmount: 10_000, targetAmount: 100_000, status: "BEHIND" });
    expect(overview.activeRisks.some((risk) => risk.code === "GOAL_BEHIND_goal-1")).toBe(true);

    vi.useRealTimers();
  });

  it("uses Settlement-derived net collections for a COLLECTION goal, including reversals and currency isolation", async () => {
    db.salesGoal.findMany.mockResolvedValue([{
      id: "goal-2", title: "Tahsilat Hedefi", currency: "TRY",
      targetRevenueCents: null, targetCollectionCents: 10_000_00, targetValue: null, actualValue: null,
      startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: new Date("2026-08-31T00:00:00Z"),
    }]);
    buildCollectionsDataset.mockResolvedValue({
      period: { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-08-31T00:00:00Z"), label: "Tahsilat Hedefi", isoLabel: "goal-goal-2" },
      records: [
        { occurredAt: new Date("2026-08-05T00:00:00Z"), customerName: "A", title: "Original", amount: 16_000, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" },
        { occurredAt: new Date("2026-08-06T00:00:00Z"), customerName: "A", title: "Reversal", amount: -1_000, currency: "TRY", invoiceNumber: null, kind: "REVERSAL" },
        { occurredAt: new Date("2026-08-07T00:00:00Z"), customerName: "B", title: "USD", amount: 50_000, currency: "USD", invoiceNumber: null, kind: "ORIGINAL" },
      ],
      recordCount: 3,
      totalsByCurrency: { TRY: 15_000, USD: 50_000 },
    });
    vi.setSystemTime(new Date("2026-08-16T00:00:00Z"));

    const overview = await buildBusinessOverview("org-1");

    expect(overview.goals[0]).toMatchObject({ metric: "COLLECTION", actualAmount: 15_000, targetAmount: 10_000, status: "ON_TRACK" });
    expect(overview.activeOpportunities.some((item) => item.code === "GOAL_AHEAD_goal-2")).toBe(true);
    expect(buildCollectionsDataset).toHaveBeenCalledWith("org-1", expect.objectContaining({
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-08-31T00:00:00Z"),
    }));
    expect(db.payment.findMany).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("reports a self-reported goal's stored values honestly when it has no revenue/collection target to recompute against", async () => {
    db.salesGoal.findMany.mockResolvedValue([{
      id: "goal-3", title: "Yeni Müşteri Hedefi", currency: "TRY",
      targetRevenueCents: null, targetCollectionCents: null, targetValue: "20", actualValue: "5",
      startsAt: null, endsAt: null,
    }]);

    const overview = await buildBusinessOverview("org-1");

    expect(overview.goals[0]).toMatchObject({ metric: "SELF_REPORTED", targetAmount: 20, actualAmount: 5, status: "BEHIND" });
    expect(db.invoice.findMany).not.toHaveBeenCalled();
    expect(db.payment.findMany).not.toHaveBeenCalled();
  });

  it("flags production capacity as a risk when orders run past their planned end date", async () => {
    db.salesGoal.findMany.mockResolvedValue([]);
    db.productionOrder.findMany.mockResolvedValue([
      { quantityPlanned: 100, quantityProduced: 40, plannedEndAt: new Date("2026-08-01T00:00:00Z"), actualEndAt: null, status: "IN_PROGRESS" },
      { quantityPlanned: 50, quantityProduced: 50, plannedEndAt: new Date("2026-08-01T00:00:00Z"), actualEndAt: new Date("2026-07-30T00:00:00Z"), status: "COMPLETED" },
    ]);
    vi.setSystemTime(new Date("2026-08-16T00:00:00Z"));

    const overview = await buildBusinessOverview("org-1");

    expect(overview.capacity).toMatchObject({ totalPlanned: 150, totalProduced: 90, lateOrderCount: 1, activeProductionOrderCount: 1 });
    expect(overview.activeRisks.some((risk) => risk.code === "PRODUCTION_LATE")).toBe(true);

    vi.useRealTimers();
  });

  it("reads the already-computed supplier dependency-risk flag as a risk signal without recomputing it", async () => {
    db.salesGoal.findMany.mockResolvedValue([]);
    db.supplier.findMany.mockResolvedValue([
      { riskProfile: { dependencyRiskFlag: true } },
      { riskProfile: { dependencyRiskFlag: false } },
      { riskProfile: null },
    ]);

    const overview = await buildBusinessOverview("org-1");

    expect(db.supplier.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "ACTIVE" }, select: { riskProfile: true } });
    const risk = overview.activeRisks.find((item) => item.code === "SUPPLIER_DEPENDENCY_RISK");
    expect(risk).toMatchObject({ domain: "suppliers", severity: "MEDIUM" });
    expect(risk?.detail).toContain("1 tedarikçi");
  });

  it("flags orders stuck ON_HOLD as a risk", async () => {
    db.salesGoal.findMany.mockResolvedValue([]);
    db.order.count.mockResolvedValue(4);

    const overview = await buildBusinessOverview("org-1");

    expect(db.order.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "ON_HOLD" } });
    const risk = overview.activeRisks.find((item) => item.code === "ORDERS_ON_HOLD");
    expect(risk).toMatchObject({ domain: "orders", severity: "HIGH" });
  });

  it("flags failed deliveries as a risk", async () => {
    db.salesGoal.findMany.mockResolvedValue([]);
    db.delivery.count.mockResolvedValue(1);

    const overview = await buildBusinessOverview("org-1");

    expect(db.delivery.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "FAILED_DELIVERY" } });
    const risk = overview.activeRisks.find((item) => item.code === "DELIVERIES_FAILED");
    expect(risk).toMatchObject({ domain: "deliveries", severity: "MEDIUM" });
  });

  it("stays silent on suppliers/orders/deliveries when nothing is at risk there", async () => {
    db.salesGoal.findMany.mockResolvedValue([]);

    const overview = await buildBusinessOverview("org-1");

    expect(overview.activeRisks.some((risk) => risk.domain === "suppliers")).toBe(false);
    expect(overview.activeRisks.some((risk) => risk.domain === "orders")).toBe(false);
    expect(overview.activeRisks.some((risk) => risk.domain === "deliveries")).toBe(false);
  });
});
