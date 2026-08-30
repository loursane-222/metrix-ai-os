import { beforeEach, describe, expect, it, vi } from "vitest";

const { getExpenseByIdMock, cancelExpenseMock } = vi.hoisted(() => ({ getExpenseByIdMock: vi.fn(), cancelExpenseMock: vi.fn() }));
vi.mock("@/lib/core/expenses/expense-repository", () => ({ getExpenseById: getExpenseByIdMock, cancelExpense: cancelExpenseMock }));

import { expenseCancelHandler } from "../expense-cancel-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "expense.cancel",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["expenses.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("expenseCancelHandler", () => {
  beforeEach(() => { getExpenseByIdMock.mockReset(); cancelExpenseMock.mockReset(); });

  it("cancels a pending expense through the canonical service", async () => {
    getExpenseByIdMock.mockResolvedValue({ id: "expense-1", status: "PENDING" });
    cancelExpenseMock.mockResolvedValue({ id: "expense-1", status: "CANCELLED" });
    const result = await expenseCancelHandler(envelope({ expenseId: "expense-1", reason: "yanlış girildi" }));
    expect(cancelExpenseMock).toHaveBeenCalledWith({ id: "expense-1", organizationId: "org-1", reason: "yanlış girildi" });
    expect(result).toMatchObject({ status: "SUCCESS" });
  });

  it("reports NO_CHANGE without a second mutation when already cancelled", async () => {
    getExpenseByIdMock.mockResolvedValue({ id: "expense-1", status: "CANCELLED" });
    const result = await expenseCancelHandler(envelope({ expenseId: "expense-1" }));
    expect(cancelExpenseMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing expenseId before mutation", async () => {
    await expect(expenseCancelHandler(envelope({}))).rejects.toThrow(/expenseId/);
    expect(cancelExpenseMock).not.toHaveBeenCalled();
  });
});
