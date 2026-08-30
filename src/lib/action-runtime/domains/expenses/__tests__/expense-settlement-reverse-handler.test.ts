import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { reverseExpenseSettlementMock } = vi.hoisted(() => ({ reverseExpenseSettlementMock: vi.fn() }));
vi.mock("@/lib/core/expenses/expense-settlement.service", () => ({ reverseExpenseSettlement: reverseExpenseSettlementMock }));

import { expenseSettlementReverseHandler } from "../expense-settlement-reverse-handler";

const envelope = (input: Record<string, unknown>, entityRef: { entityType: string; entityId: string } | undefined = { entityType: "expense_settlement", entityId: "expense-settlement-1" }) => ({
  executionId: "exec-1",
  actionName: "expense.settlement.reverse",
  input,
  entityRef,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["expenses.reverse"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("expenseSettlementReverseHandler", () => {
  beforeEach(() => { reverseExpenseSettlementMock.mockReset(); });

  it("reverses the addressed expense settlement through the canonical service", async () => {
    reverseExpenseSettlementMock.mockResolvedValue({
      expense: { id: "expense-1", status: "PARTIALLY_PAID", paidAmount: "400.00" },
      settlement: { id: "reversal-1", amount: "600.00", currency: "TRY" },
      movement: { id: "reversal-movement-1" },
    });

    const result = await expenseSettlementReverseHandler(envelope({ expenseSettlementId: "expense-settlement-1", reason: "yanlış tutar girildi" }));

    expect(reverseExpenseSettlementMock).toHaveBeenCalledWith({ organizationId: "org-1", expenseSettlementId: "expense-settlement-1", reason: "yanlış tutar girildi", actorId: "user-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "expense_settlement", entityId: "expense-settlement-1" }, metadata: { reversalExpenseSettlementId: "reversal-1", expenseStatus: "PARTIALLY_PAID" } });
    expect(result.domainEvents).toEqual([
      expect.objectContaining({ eventType: "ExpenseSettlementReversed", aggregateId: "reversal-1", deduplicationKey: "expense-settlement-reversed:reversal-1" }),
    ]);
  });

  it("fails when expense settlement is not found in this organization", async () => {
    reverseExpenseSettlementMock.mockResolvedValue(null);
    const result = await expenseSettlementReverseHandler(envelope({ expenseSettlementId: "expense-settlement-1", reason: "yanlış tutar" }));
    expect(result).toMatchObject({ status: "FAILURE" });
  });

  it("rejects a missing reason before mutation", async () => {
    await expect(expenseSettlementReverseHandler(envelope({ expenseSettlementId: "expense-settlement-1" }))).rejects.toThrow(/reason/);
    expect(reverseExpenseSettlementMock).not.toHaveBeenCalled();
  });
});
