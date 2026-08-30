import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { settleExpenseMock } = vi.hoisted(() => ({ settleExpenseMock: vi.fn() }));
vi.mock("@/lib/core/expenses/expense-settlement.service", () => ({ settleExpense: settleExpenseMock }));

import { expenseSettleHandler } from "../expense-settle-handler";

const envelope = (input: Record<string, unknown>, entityRef: { entityType: string; entityId: string } | undefined = { entityType: "expense", entityId: "expense-1" }) => ({
  executionId: "exec-1",
  actionName: "expense.settle",
  input,
  entityRef,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["expenses.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("expenseSettleHandler", () => {
  beforeEach(() => { settleExpenseMock.mockReset(); });

  it("settles the addressed expense through the canonical service", async () => {
    settleExpenseMock.mockResolvedValue({
      expense: { id: "expense-1", title: "Ofis kirası", status: "PAID", paidAmount: "1000.00", currency: "TRY" },
      settlement: { id: "expense-settlement-1" },
      movement: { id: "movement-1" },
    });

    const result = await expenseSettleHandler(envelope({ expenseId: "expense-1", amount: 1000, paymentMethod: "CASH", financialAccountReference: "account-1" }));

    expect(settleExpenseMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", expenseId: "expense-1", amount: 1000, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "user-1" }));
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "expense", entityId: "expense-1" }, metadata: { expenseId: "expense-1", status: "PAID", settlementId: "expense-settlement-1" } });
  });

  it("fails when expense is not found in this organization", async () => {
    settleExpenseMock.mockResolvedValue(null);
    const result = await expenseSettleHandler(envelope({ expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1" }));
    expect(result).toMatchObject({ status: "FAILURE" });
  });

  it("rejects an unsupported paymentMethod before calling the service", async () => {
    await expect(expenseSettleHandler(envelope({ expenseId: "expense-1", amount: 100, paymentMethod: "BITCOIN", financialAccountReference: "account-1" }))).rejects.toThrow(/paymentMethod/);
    expect(settleExpenseMock).not.toHaveBeenCalled();
  });

  it("rejects an entityRef that doesn't match the addressed expense", async () => {
    await expect(
      expenseSettleHandler(envelope({ expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1" }, { entityType: "expense", entityId: "expense-2" })),
    ).rejects.toThrow("ACTION_TARGET_CONTEXT_MISMATCH");
  });
});
