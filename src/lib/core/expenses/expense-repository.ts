import type { ExpenseStatus } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";
import { recordExpenseCreated, reverseSourceEntries } from "@/lib/accounting/ledger.service";
import { assertNetTaxMatchesTotal, assertNonEmpty, assertPositiveAmount } from "./expense.contract";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  CreateExpenseInput,
  ExpenseResult,
  ListExpensesByDateRangeInput,
  ListExpensesInput,
  UpdateExpenseInput,
} from "./expense.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

/**
 * Ekonomik tanıma (economic recognition) burada, oluşturma anında olur —
 * "EXPENSE ≠ PAYMENT" hard rule'unun ilk yarısı: gider bugün muhasebeleşir.
 * Her zaman PENDING olarak oluşturulur; "zaten ödenmiş" bir gider
 * uydurulamaz — gerçek ödeme yalnız settleExpense() (Phase 3 authority
 * pattern'i) üzerinden, ayrı bir ExpenseSettlement olarak kaydedilir.
 */
export async function createExpense(
  input: CreateExpenseInput,
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult> {
  if (!tx) return prisma.$transaction((transaction) => createExpense(input, transaction));
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.title, "title");
  assertPositiveAmount(input.amount);
  assertNetTaxMatchesTotal(input);

  const expense = await tx.expense.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      subcategory: input.subcategory ?? null,
      amount: input.amount,
      netAmount: input.netAmount ?? null,
      taxRate: input.taxRate ?? null,
      taxAmount: input.taxAmount ?? null,
      currency: input.currency ?? "TRY",
      expenseDate: input.expenseDate,
      recurrenceType: input.recurrenceType ?? "ONCE",
      status: "PENDING",
      vendorName: input.vendorName ?? null,
      supplierId: input.supplierId ?? null,
      customerId: input.customerId ?? null,
      employeeMemberId: input.employeeMemberId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      note: input.note ?? null,
    },
  });
  await recordExpenseCreated({ tx, organizationId: input.organizationId, expenseId: expense.id, entryDate: expense.expenseDate, amount: expense.amount, currency: expense.currency });
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

/**
 * Yalnız metadata günceller — status buradan asla değişmez (settlement
 * authority'nin projeksiyonudur). Bir yerleşim (settlement) başladıktan
 * sonra (paidAmount > 0) amount/currency değişikliği reddedilir — aksi
 * halde canonical net/tax/total ile gerçekleşen ödemeler arasındaki bağ
 * tutarsız kalır.
 */
export async function updateExpense(
  input: UpdateExpenseInput,
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult> {
  if (!tx) return prisma.$transaction((transaction) => updateExpense(input, transaction));
  const existing = await tx.expense.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
  if (!existing) throw new ApiValidationError("Expense not found.", 404);
  if (existing.status === "CANCELLED") throw new ApiValidationError("a cancelled expense cannot be edited.", 409);

  const changingAmount = input.amount !== undefined && input.amount !== Number(existing.amount);
  const changingCurrency = input.currency !== undefined && input.currency !== existing.currency;
  if ((changingAmount || changingCurrency) && Number(existing.paidAmount) > 0) {
    throw new ApiValidationError("amount/currency cannot change once settlement has begun against this expense.", 409);
  }
  if (input.amount !== undefined) assertPositiveAmount(input.amount);
  assertNetTaxMatchesTotal({
    amount: input.amount ?? Number(existing.amount),
    netAmount: input.netAmount !== undefined ? input.netAmount : existing.netAmount !== null ? Number(existing.netAmount) : undefined,
    taxAmount: input.taxAmount !== undefined ? input.taxAmount : existing.taxAmount !== null ? Number(existing.taxAmount) : undefined,
  });

  return tx.expense.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.subcategory !== undefined ? { subcategory: input.subcategory } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.netAmount !== undefined ? { netAmount: input.netAmount } : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.taxAmount !== undefined ? { taxAmount: input.taxAmount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
      ...(input.recurrenceType !== undefined ? { recurrenceType: input.recurrenceType } : {}),
      ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.employeeMemberId !== undefined ? { employeeMemberId: input.employeeMemberId } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
}

/**
 * payment.void'un Expense karşılığı: yalnız hiç settlement başlamamış
 * (paidAmount = 0) bir gider iptal edilebilir — gerçekleşmiş bir ödemeyi
 * sessizce geri almaz. Oluşturma anındaki ekonomik tanıma ters kayıtla
 * geri alınır (reverseSourceEntries, mevcut EXPENSE sourceType).
 */
export async function cancelExpense(
  input: { id: string; organizationId: string; reason?: string },
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult> {
  if (!tx) return prisma.$transaction((transaction) => cancelExpense(input, transaction));
  const existing = await tx.expense.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
  if (!existing) throw new ApiValidationError("Expense not found.", 404);
  if (existing.status === "CANCELLED") return existing;
  if (Number(existing.paidAmount) > 0) {
    throw new ApiValidationError("an expense with recorded settlements cannot be cancelled; reverse its settlements first.", 409);
  }

  const cancelled = await tx.expense.update({
    where: { id: input.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason ?? null },
  });
  await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "EXPENSE", sourceId: existing.id, entryDate: new Date() });
  return cancelled;
}

/**
 * Tenant-safe koşullu güncelleme: applyPaymentAmount (payment.repository.ts)
 * ile aynı desen, Expense.paidAmount/status için. Concurrency-safe CAS
 * (expectedPriorPaidAmount) burada bilerek yok — Phase 4 bunu istemiyor;
 * gerekirse Payment'ta yapıldığı gibi ayrı bir review turu ekler.
 *
 * expectedPriorPaidAmount opsiyoneldir — verildiğinde payment.repository.ts
 * ile aynı atomik compare-and-swap: yalnız satır hâlâ tam beklenen eski
 * paidAmount'taysa güncelleme eşleşir. count=0 ve satır hâlâ varsa (yalnız
 * paidAmount değiştiği için eşleşmediyse) bu "bulunamadı" değil eşzamanlılık
 * çakışmasıdır — ExpenseConcurrentlyModifiedError fırlatılır.
 * expectedPriorPaidAmount verilmezse davranış değişmez.
 */
export class ExpenseConcurrentlyModifiedError extends Error {
  constructor(expenseId: string) {
    super(`Expense ${expenseId} was concurrently modified.`);
    this.name = "ExpenseConcurrentlyModifiedError";
  }
}

export async function applyExpenseSettlementAmount(
  input: { id: string; organizationId: string; paidAmount: number; status: ExpenseStatus; expectedPriorPaidAmount?: number },
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const result = await client.expense.updateMany({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      ...(input.expectedPriorPaidAmount !== undefined ? { paidAmount: input.expectedPriorPaidAmount } : {}),
    },
    data: { paidAmount: input.paidAmount, status: input.status },
  });
  if (result.count === 0) {
    if (input.expectedPriorPaidAmount !== undefined) {
      const stillExists = await client.expense.findFirst({ where: { id: input.id, organizationId: input.organizationId }, select: { id: true } });
      if (stillExists) throw new ExpenseConcurrentlyModifiedError(input.id);
    }
    return null;
  }
  return client.expense.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
}

export async function findExpenseByIdForOrganization(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<ExpenseResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.expense.findFirst({ where: { id, organizationId } });
}
