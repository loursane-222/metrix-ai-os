import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  invoice: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  expense: { findMany: vi.fn() },
}));

const { computeActualCashPositionMock, computeAgingReportMock } = vi.hoisted(() => ({
  computeActualCashPositionMock: vi.fn(),
  computeAgingReportMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));
vi.mock("@/lib/core/reporting/cash-position.service", () => ({ computeActualCashPosition: computeActualCashPositionMock }));
vi.mock("@/lib/core/reporting/obligation-aging.service", () => ({ computeAgingReport: computeAgingReportMock }));

import { getAccountingSummary } from "../accounting-summary";

/**
 * Phase 13: cashPosition/totalReceivable/totalPayable now delegate to the
 * canonical src/lib/core/reporting/ services (FinancialAccountMovement /
 * ObligationScheduleLine aging) instead of approximating from raw
 * Invoice/Payment/Expense rows — those two services have their own
 * dedicated tests (unit + real-Postgres integration) proving THEIR
 * correctness; this file mocks them and tests only getAccountingSummary's
 * own remaining logic (monthlyRevenue/monthlyExpense/monthlyTaxLiability,
 * assembling the final shape, availability flags).
 */
describe("computed accounting summary", () => {
  beforeEach(() => {
    db.invoice.findMany.mockReset();
    db.payment.findMany.mockReset();
    db.expense.findMany.mockReset();
    computeActualCashPositionMock.mockReset();
    computeAgingReportMock.mockReset();
  });

  it("computes monthly KPIs from canonical lifecycle fields without mixing currencies, and delegates position/aging to the canonical reporting services", async () => {
    db.invoice.findMany.mockResolvedValue([
      { totalAmount: 1200, taxAmount: 200, currency: "TRY", status: "SENT", createdAt: new Date("2026-08-02T10:00:00Z") },
      { totalAmount: 600, taxAmount: 100, currency: "TRY", status: "PAID", createdAt: new Date("2026-08-03T10:00:00Z") },
      { totalAmount: 240, taxAmount: 40, currency: "EUR", status: "SENT", createdAt: new Date("2026-08-04T10:00:00Z") },
      { totalAmount: 9000, taxAmount: 1500, currency: "TRY", status: "DRAFT", createdAt: new Date("2026-08-05T10:00:00Z") },
    ]);
    db.payment.findMany.mockResolvedValue([{ amount: 1000, paidAmount: 250, currency: "TRY", status: "PARTIAL" }]);
    db.expense.findMany.mockResolvedValue([
      { amount: 300, currency: "TRY", status: "PAID", expenseDate: new Date("2026-08-02T10:00:00Z") },
      { amount: 400, currency: "TRY", status: "PENDING", expenseDate: new Date("2026-08-03T10:00:00Z") },
      { amount: 50, currency: "EUR", status: "OVERDUE", expenseDate: new Date("2026-07-03T10:00:00Z") },
      { amount: 999, currency: "TRY", status: "CANCELLED", expenseDate: new Date("2026-08-04T10:00:00Z") },
    ]);
    computeActualCashPositionMock.mockResolvedValue({ asOf: "2026-08-06T12:00:00.000Z", accounts: [{ financialAccountId: "acc-1", name: "Ana Kasa", type: "CASH", currency: "TRY", balance: 450 }], totalsByCurrency: [{ currency: "TRY", amount: 450 }] });
    computeAgingReportMock.mockImplementation(async (_org: string, direction: "RECEIVABLE" | "PAYABLE") =>
      direction === "RECEIVABLE"
        ? { asOf: "x", direction, items: [], totalsByBucket: [{ bucket: "OVERDUE", currency: "TRY", amount: 1950 }, { bucket: "NOT_YET_DUE", currency: "EUR", amount: 340 }] }
        : { asOf: "x", direction, items: [], totalsByBucket: [{ bucket: "OVERDUE", currency: "EUR", amount: 50 }, { bucket: "DUE_TODAY", currency: "TRY", amount: 400 }] },
    );

    const result = await getAccountingSummary("org-1", new Date("2026-08-06T12:00:00Z"));

    expect(result.metrics.monthlyRevenue.amounts).toEqual([{ currency: "EUR", amount: 240 }, { currency: "TRY", amount: 1800 }]);
    expect(result.metrics.monthlyTaxLiability.amounts).toEqual([{ currency: "EUR", amount: 40 }, { currency: "TRY", amount: 300 }]);
    expect(result.metrics.monthlyExpense.amounts).toEqual([{ currency: "TRY", amount: 700 }]);
    expect(result.metrics.cashPosition.amounts).toEqual([{ currency: "TRY", amount: 450 }]);
    expect(result.metrics.totalReceivable.amounts).toEqual([{ currency: "EUR", amount: 340 }, { currency: "TRY", amount: 1950 }]);
    expect(result.metrics.totalPayable.amounts).toEqual([{ currency: "EUR", amount: 50 }, { currency: "TRY", amount: 400 }]);
    expect(computeAgingReportMock).toHaveBeenCalledWith("org-1", "RECEIVABLE", expect.any(Date));
    expect(computeAgingReportMock).toHaveBeenCalledWith("org-1", "PAYABLE", expect.any(Date));
  });

  it("marks metrics unavailable when their canonical source table has no records", async () => {
    db.invoice.findMany.mockResolvedValue([]);
    db.payment.findMany.mockResolvedValue([]);
    db.expense.findMany.mockResolvedValue([]);
    computeActualCashPositionMock.mockResolvedValue({ asOf: "x", accounts: [], totalsByCurrency: [] });
    computeAgingReportMock.mockResolvedValue({ asOf: "x", direction: "RECEIVABLE", items: [], totalsByBucket: [] });

    const result = await getAccountingSummary("org-empty", new Date("2026-08-06T12:00:00Z"));

    expect(Object.values(result.metrics).every((metric) => metric.available === false)).toBe(true);
  });
});
