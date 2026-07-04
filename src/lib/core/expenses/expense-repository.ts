import { prisma } from "@/lib/core/shared/prisma";

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
  const client: PrismaClientLike = tx ?? prisma;

  return client.expense.create({
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
  const client: PrismaClientLike = tx ?? prisma;

  await client.expense.updateMany({
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
}

export async function deleteExpense(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client: PrismaClientLike = tx ?? prisma;

  await client.expense.deleteMany({
    where: { id, organizationId },
  });
}
