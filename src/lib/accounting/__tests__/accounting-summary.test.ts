import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  invoice: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  expense: { findMany: vi.fn() },
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));

import { getAccountingSummary } from "../accounting-summary";

describe("computed accounting summary", () => {
  beforeEach(() => {
    db.invoice.findMany.mockReset();
    db.payment.findMany.mockReset();
    db.expense.findMany.mockReset();
  });

  it("computes each KPI from canonical lifecycle fields without mixing currencies", async () => {
    db.invoice.findMany.mockResolvedValue([
      { totalAmount: 1200, taxAmount: 200, currency: "TRY", status: "SENT", createdAt: new Date("2026-08-02T10:00:00Z") },
      { totalAmount: 600, taxAmount: 100, currency: "TRY", status: "PAID", createdAt: new Date("2026-08-03T10:00:00Z") },
      { totalAmount: 240, taxAmount: 40, currency: "EUR", status: "SENT", createdAt: new Date("2026-08-04T10:00:00Z") },
      { totalAmount: 9000, taxAmount: 1500, currency: "TRY", status: "DRAFT", createdAt: new Date("2026-08-05T10:00:00Z") },
    ]);
    db.payment.findMany.mockResolvedValue([
      { amount: 1000, paidAmount: 250, currency: "TRY", status: "PARTIAL" },
      { amount: 500, paidAmount: 500, currency: "TRY", status: "PAID" },
      { amount: 100, paidAmount: 0, currency: "EUR", status: "PENDING" },
    ]);
    db.expense.findMany.mockResolvedValue([
      { amount: 300, currency: "TRY", status: "PAID", expenseDate: new Date("2026-08-02T10:00:00Z") },
      { amount: 400, currency: "TRY", status: "PENDING", expenseDate: new Date("2026-08-03T10:00:00Z") },
      { amount: 50, currency: "EUR", status: "OVERDUE", expenseDate: new Date("2026-07-03T10:00:00Z") },
      { amount: 999, currency: "TRY", status: "CANCELLED", expenseDate: new Date("2026-08-04T10:00:00Z") },
    ]);

    const result = await getAccountingSummary("org-1", new Date("2026-08-06T12:00:00Z"));

    expect(result.metrics.monthlyRevenue.amounts).toEqual([{ currency: "EUR", amount: 240 }, { currency: "TRY", amount: 1800 }]);
    expect(result.metrics.monthlyTaxLiability.amounts).toEqual([{ currency: "EUR", amount: 40 }, { currency: "TRY", amount: 300 }]);
    expect(result.metrics.monthlyExpense.amounts).toEqual([{ currency: "TRY", amount: 700 }]);
    expect(result.metrics.totalReceivable.amounts).toEqual([{ currency: "EUR", amount: 340 }, { currency: "TRY", amount: 1950 }]);
    expect(result.metrics.totalPayable.amounts).toEqual([{ currency: "EUR", amount: 50 }, { currency: "TRY", amount: 400 }]);
    expect(result.metrics.cashPosition.amounts).toEqual([{ currency: "TRY", amount: 450 }]);
  });

  it("marks metrics unavailable when their canonical source table has no records", async () => {
    db.invoice.findMany.mockResolvedValue([]);
    db.payment.findMany.mockResolvedValue([]);
    db.expense.findMany.mockResolvedValue([]);
    const result = await getAccountingSummary("org-empty", new Date("2026-08-06T12:00:00Z"));
    expect(Object.values(result.metrics).every((metric) => metric.available === false)).toBe(true);
  });
});
