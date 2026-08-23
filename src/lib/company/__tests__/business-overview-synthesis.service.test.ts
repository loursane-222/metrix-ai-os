import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  salesGoal: { findMany: vi.fn() },
  invoice: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  productionOrder: { findMany: vi.fn() },
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));

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

  it("marks a collection goal ON_TRACK and reports it as an opportunity when real payments run well ahead of target", async () => {
    db.salesGoal.findMany.mockResolvedValue([{
      id: "goal-2", title: "Tahsilat Hedefi", currency: "TRY",
      targetRevenueCents: null, targetCollectionCents: 10_000_00, targetValue: null, actualValue: null,
      startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: new Date("2026-08-31T00:00:00Z"),
    }]);
    db.payment.findMany.mockResolvedValue([{ paidAmount: 15_000 }]);
    vi.setSystemTime(new Date("2026-08-16T00:00:00Z"));

    const overview = await buildBusinessOverview("org-1");

    expect(overview.goals[0]).toMatchObject({ metric: "COLLECTION", actualAmount: 15_000, targetAmount: 10_000, status: "ON_TRACK" });
    expect(overview.activeOpportunities.some((item) => item.code === "GOAL_AHEAD_goal-2")).toBe(true);

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
});
