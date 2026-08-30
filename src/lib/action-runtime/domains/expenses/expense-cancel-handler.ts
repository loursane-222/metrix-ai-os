import { getExpenseById, cancelExpense } from "@/lib/core/expenses/expense-repository";
import type { ActionHandler } from "../../execution";

export const expenseCancelHandler: ActionHandler = async (envelope) => {
  const expenseId = envelope.input.expenseId;
  if (typeof expenseId !== "string" || !expenseId.trim()) throw new Error("expenseId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getExpenseById(expenseId, organizationId);
  if (!existing) throw new Error("Expense not found.");
  if (existing.status === "CANCELLED") {
    return { status: "SUCCESS", entityRef: { entityType: "expense", entityId: expenseId }, resultOutcome: "NO_CHANGE", metadata: { expenseId }, domainEvents: [], sideEffects: [] };
  }
  const reason = envelope.input.reason;
  await cancelExpense({ id: expenseId, organizationId, reason: typeof reason === "string" && reason.trim() ? reason.trim() : undefined });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "expense", entityId: expenseId },
    resultSummary: "expense.cancel completed.",
    metadata: { expenseId },
    domainEvents: [],
    sideEffects: [],
  };
};
