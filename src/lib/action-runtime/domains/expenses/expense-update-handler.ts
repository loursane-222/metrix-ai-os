import { ExpenseCategory } from "@prisma/client";
import { updateExpense } from "@/lib/core/expenses/expense-repository";
import type { ActionHandler } from "../../execution";

export const expenseUpdateHandler: ActionHandler = async (envelope) => {
  const expenseId = envelope.input.expenseId;
  if (typeof expenseId !== "string" || !expenseId.trim()) throw new Error("expenseId is required.");
  if (envelope.entityRef?.entityType !== "expense" || envelope.entityRef.entityId !== expenseId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }

  const updated = await updateExpense({
    id: expenseId,
    organizationId: envelope.executionContext.organizationId,
    ...(envelope.input.title !== undefined ? { title: requiredString(envelope.input.title, "title") } : {}),
    ...(envelope.input.description !== undefined ? { description: nullableString(envelope.input.description, "description") ?? undefined } : {}),
    ...(envelope.input.category !== undefined ? { category: requiredCategory(envelope.input.category) } : {}),
    ...(envelope.input.subcategory !== undefined ? { subcategory: nullableString(envelope.input.subcategory, "subcategory") ?? undefined } : {}),
    ...(envelope.input.amount !== undefined ? { amount: requiredNumber(envelope.input.amount, "amount") } : {}),
    ...(envelope.input.netAmount !== undefined ? { netAmount: requiredNumber(envelope.input.netAmount, "netAmount") } : {}),
    ...(envelope.input.taxAmount !== undefined ? { taxAmount: requiredNumber(envelope.input.taxAmount, "taxAmount") } : {}),
    ...(envelope.input.taxRate !== undefined ? { taxRate: requiredNumber(envelope.input.taxRate, "taxRate") } : {}),
    ...(envelope.input.expenseDate !== undefined ? { expenseDate: requiredDate(envelope.input.expenseDate) } : {}),
    ...(envelope.input.vendorName !== undefined ? { vendorName: nullableString(envelope.input.vendorName, "vendorName") ?? undefined } : {}),
    ...(envelope.input.supplierId !== undefined ? { supplierId: nullableString(envelope.input.supplierId, "supplierId") } : {}),
    ...(envelope.input.customerId !== undefined ? { customerId: nullableString(envelope.input.customerId, "customerId") } : {}),
    ...(envelope.input.employeeMemberId !== undefined ? { employeeMemberId: nullableString(envelope.input.employeeMemberId, "employeeMemberId") } : {}),
    ...(envelope.input.note !== undefined ? { note: nullableString(envelope.input.note, "note") ?? undefined } : {}),
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "expense", entityId: expenseId },
    resultSummary: "expense.update completed.",
    metadata: { expenseId, status: updated.status },
    domainEvents: [],
    sideEffects: [],
  };
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null.`);
  return value.trim() || null;
}
function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number.`);
  return value;
}
function requiredDate(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) throw new Error("expenseDate must be a valid date.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("expenseDate must be a valid date.");
  return date;
}
function requiredCategory(value: unknown): ExpenseCategory {
  if (typeof value !== "string" || !Object.values(ExpenseCategory).includes(value as ExpenseCategory)) {
    throw new Error("category must be one of " + Object.values(ExpenseCategory).join(", ") + ".");
  }
  return value as ExpenseCategory;
}
