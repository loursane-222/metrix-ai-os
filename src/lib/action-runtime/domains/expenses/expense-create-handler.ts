import { ExpenseCategory } from "@prisma/client";
import { createExpense } from "@/lib/core/expenses/expense-repository";
import type { ActionHandler } from "../../execution";

export const expenseCreateHandler: ActionHandler = async (envelope) => {
  const expense = await createExpense({
    organizationId: envelope.executionContext.organizationId,
    title: requiredString(envelope.input.title, "title"),
    description: optionalString(envelope.input.description),
    category: requiredCategory(envelope.input.category),
    subcategory: optionalString(envelope.input.subcategory),
    amount: requiredNumber(envelope.input.amount, "amount"),
    netAmount: optionalNumber(envelope.input.netAmount),
    taxRate: optionalNumber(envelope.input.taxRate),
    taxAmount: optionalNumber(envelope.input.taxAmount),
    currency: optionalString(envelope.input.currency),
    expenseDate: requiredDate(envelope.input.expenseDate),
    recurrenceType: envelope.input.recurrenceType as never,
    vendorName: optionalString(envelope.input.vendorName),
    supplierId: optionalString(envelope.input.supplierId),
    customerId: optionalString(envelope.input.customerId),
    employeeMemberId: optionalString(envelope.input.employeeMemberId),
    createdByUserId: envelope.executionContext.actorId,
    note: optionalString(envelope.input.note),
    corporateCardId: optionalString(envelope.input.corporateCardId),
  });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "expense", entityId: expense.id },
    resultSummary: "expense.create completed.",
    metadata: { expenseId: expense.id, status: expense.status },
    domainEvents: [],
    sideEffects: [],
  };
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number.`);
  return value;
}
function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function requiredDate(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) throw new Error("expenseDate is required.");
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
