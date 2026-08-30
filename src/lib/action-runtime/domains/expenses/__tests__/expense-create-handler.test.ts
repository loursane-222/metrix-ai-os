import { beforeEach, describe, expect, it, vi } from "vitest";

const { createExpenseMock } = vi.hoisted(() => ({ createExpenseMock: vi.fn() }));
vi.mock("@/lib/core/expenses/expense-repository", () => ({ createExpense: createExpenseMock }));

import { expenseCreateHandler } from "../expense-create-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "expense.create",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["expenses.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("expenseCreateHandler", () => {
  beforeEach(() => createExpenseMock.mockReset());

  it("creates the expense with organization/actor taken only from trusted execution context", async () => {
    createExpenseMock.mockResolvedValue({ id: "expense-1", status: "PENDING" });
    await expenseCreateHandler(envelope({ organizationId: "attacker-org", title: "Ofis kirası", category: "RENT", amount: 1000, expenseDate: "2026-08-01T00:00:00.000Z" }));
    expect(createExpenseMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", createdByUserId: "user-1", title: "Ofis kirası", category: "RENT", amount: 1000 }));
  });

  it("rejects an unknown category", async () => {
    await expect(expenseCreateHandler(envelope({ title: "x", category: "SPACESHIP", amount: 100, expenseDate: "2026-08-01T00:00:00.000Z" }))).rejects.toThrow(/category/);
    expect(createExpenseMock).not.toHaveBeenCalled();
  });

  it("rejects a missing amount", async () => {
    await expect(expenseCreateHandler(envelope({ title: "x", category: "RENT", expenseDate: "2026-08-01T00:00:00.000Z" }))).rejects.toThrow(/amount/);
  });
});
