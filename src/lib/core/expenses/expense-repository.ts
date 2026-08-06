import { prisma } from "@/lib/core/shared/prisma";
import { recordExpenseCreated, recordExpensePaid, reverseSourceEntries } from "@/lib/accounting/ledger.service";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateExpenseInput,
  ExpenseResult,
  ListExpensesByDateRangeInput,
  ListExpensesInput,
  UpdateExpenseInput,
} from "./expense.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createExpense(
  input: CreateExpenseInput,
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult> {
  if (!tx) return prisma.$transaction((transaction) => createExpense(input, transaction));
  const expense = await tx.expense.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      category: input.category,
      amount: input.amount,
      currency: input.currency ?? "TRY",
      expenseDate: input.expenseDate,
      recurrenceType: input.recurrenceType ?? "ONCE",
      status: input.status ?? "PENDING",
      vendorName: input.vendorName,
      note: input.note,
    },
  });
  await recordExpenseCreated({ tx, organizationId: input.organizationId, expenseId: expense.id, entryDate: expense.expenseDate, amount: expense.amount, currency: expense.currency });
  if (expense.status === "PAID") await recordExpensePaid({ tx, organizationId: input.organizationId, expenseId: expense.id, entryDate: expense.expenseDate, amount: expense.amount, currency: expense.currency });
  return expense;
}

export async function getExpenseById(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.expense.findFirst({
    where: { id, organizationId },
  });
}

export async function listExpensesForOrganization(
  input: ListExpensesInput,
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.expense.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.recurrenceType ? { recurrenceType: input.recurrenceType } : {}),
    },
    orderBy: { expenseDate: "desc" },
    take: input.limit ?? 100,
  });
}

export async function listExpensesForOrganizationByDateRange(
  input: ListExpensesByDateRangeInput,
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult[]> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.expense.findMany({
    where: {
      organizationId: input.organizationId,
      expenseDate: {
        gte: input.from,
        lte: input.to,
      },
      ...(input.status ? { status: input.status } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.recurrenceType ? { recurrenceType: input.recurrenceType } : {}),
    },
    orderBy: { expenseDate: "desc" },
  });
}

export async function updateExpense(
  input: UpdateExpenseInput,
  tx?: PrismaTransactionClient,
): Promise<void> {
  if (!tx) return prisma.$transaction((transaction) => updateExpense(input, transaction));
  const before = await tx.expense.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
  if (!before) return;
  await tx.expense.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
      ...(input.recurrenceType !== undefined ? { recurrenceType: input.recurrenceType } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
  const after = await tx.expense.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
  if (!after) return;
  if (before.status !== "PAID" && after.status === "PAID") await recordExpensePaid({ tx, organizationId: input.organizationId, expenseId: after.id, entryDate: new Date(), amount: after.amount, currency: after.currency });
  if (before.status !== "CANCELLED" && after.status === "CANCELLED") await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "EXPENSE", sourceId: after.id, entryDate: new Date() });
}

export async function deleteExpense(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  await updateExpense({ id, organizationId, status: "CANCELLED" }, tx);
}
