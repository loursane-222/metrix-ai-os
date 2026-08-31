import type { CardStatement, CardStatementPayment, CorporateCard, CorporateCardStatus, FinancialAccountMovement, MoneyDirection, PaymentMethod, Prisma, SettlementKind } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateCorporateCardInput } from "./corporate-card.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export function createCorporateCard(input: CreateCorporateCardInput, tx: PrismaTransactionClient): Promise<CorporateCard> {
  return tx.corporateCard.create({
    data: {
      organizationId: input.organizationId,
      cardholderMemberId: input.cardholderMemberId,
      bankName: input.bankName ?? null,
      last4: input.last4 ?? null,
      label: input.label,
      currency: input.currency ?? "TRY",
      status: "ACTIVE",
      actorId: input.actorId,
    },
  });
}

export function findCorporateCardById(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<CorporateCard | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.corporateCard.findFirst({ where: { id, organizationId } });
}

export function listCorporateCards(organizationId: string, status?: CorporateCardStatus): Promise<CorporateCard[]> {
  return prisma.corporateCard.findMany({ where: { organizationId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" } });
}

export class CorporateCardConcurrentlyModifiedError extends Error {
  constructor(id: string) {
    super(`CorporateCard ${id} was concurrently modified.`);
    this.name = "CorporateCardConcurrentlyModifiedError";
  }
}

export async function updateCorporateCardStatus(id: string, organizationId: string, fromStatus: CorporateCardStatus, toStatus: CorporateCardStatus, tx: PrismaTransactionClient = prisma) {
  const result = await tx.corporateCard.updateMany({ where: { id, organizationId, status: fromStatus }, data: { status: toStatus } });
  if (result.count === 0) {
    const stillExists = await tx.corporateCard.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (stillExists) throw new CorporateCardConcurrentlyModifiedError(id);
  }
  return result;
}

export function createCardStatement(
  input: { organizationId: string; corporateCardId: string; periodStart: Date; periodEnd: Date; dueDate: Date; currency: string; actorId: string },
  tx: PrismaTransactionClient,
): Promise<CardStatement> {
  return tx.cardStatement.create({
    data: {
      organizationId: input.organizationId,
      corporateCardId: input.corporateCardId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueDate: input.dueDate,
      currency: input.currency,
      status: "OPEN",
      actorId: input.actorId,
    },
  });
}

export function findCardStatementById(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<CardStatement | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.cardStatement.findFirst({ where: { id, organizationId } });
}

/**
 * closeCardStatement'ın deterministik girdisi — bu kartın, bu döneme
 * (expenseDate BETWEEN periodStart/periodEnd) düşen ve HENÜZ hiçbir
 * statement'a atanmamış (cardStatementId IS NULL) gerçek Expense'leri.
 * totalAmount bunların toplamıdır; dışarıdan uydurulmaz.
 */
export function findUnassignedCardExpensesForPeriod(organizationId: string, corporateCardId: string, periodStart: Date, periodEnd: Date, tx: PrismaTransactionClient) {
  return tx.expense.findMany({
    where: { organizationId, corporateCardId, cardStatementId: null, status: { not: "CANCELLED" }, expenseDate: { gte: periodStart, lte: periodEnd } },
  });
}

export class CardStatementConcurrentlyModifiedError extends Error {
  constructor(id: string) {
    super(`CardStatement ${id} was concurrently modified.`);
    this.name = "CardStatementConcurrentlyModifiedError";
  }
}

export async function closeCardStatementRow(
  input: { id: string; organizationId: string; totalAmount: number; closedAt: Date },
  tx: PrismaTransactionClient,
): Promise<CardStatement> {
  const result = await tx.cardStatement.updateMany({
    where: { id: input.id, organizationId: input.organizationId, status: "OPEN" },
    data: { status: "CLOSED", totalAmount: input.totalAmount, closedAt: input.closedAt },
  });
  if (result.count === 0) {
    const stillExists = await tx.cardStatement.findFirst({ where: { id: input.id, organizationId: input.organizationId }, select: { id: true } });
    if (stillExists) throw new CardStatementConcurrentlyModifiedError(input.id);
  }
  const updated = await tx.cardStatement.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
  if (!updated) throw new CardStatementConcurrentlyModifiedError(input.id);
  return updated;
}

export function assignExpensesToCardStatement(expenseIds: string[], cardStatementId: string, organizationId: string, tx: PrismaTransactionClient) {
  return tx.expense.updateMany({ where: { id: { in: expenseIds }, organizationId }, data: { cardStatementId } });
}

/**
 * Payment.paidAmount/Expense.paidAmount ile aynı statü: cache/projection.
 * expectedPriorPaidAmount verildiğinde CAS.
 */
export async function applyCardStatementPaymentAmount(
  input: { id: string; organizationId: string; status: "CLOSED" | "PARTIALLY_PAID" | "PAID"; expectedPriorStatus?: "CLOSED" | "PARTIALLY_PAID" | "PAID" },
  tx: PrismaTransactionClient,
): Promise<CardStatement | null> {
  const result = await tx.cardStatement.updateMany({
    where: { id: input.id, organizationId: input.organizationId, ...(input.expectedPriorStatus ? { status: input.expectedPriorStatus } : {}) },
    data: { status: input.status },
  });
  if (result.count === 0) {
    if (input.expectedPriorStatus !== undefined) {
      const stillExists = await tx.cardStatement.findFirst({ where: { id: input.id, organizationId: input.organizationId }, select: { id: true } });
      if (stillExists) throw new CardStatementConcurrentlyModifiedError(input.id);
    }
    return null;
  }
  return tx.cardStatement.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
}

export type CreateCardStatementPaymentInput = {
  organizationId: string;
  cardStatementId: string;
  kind: SettlementKind;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  financialAccountId: string;
  occurredAt: Date;
  idempotencyKey: string | null;
  requestHash: string | null;
  reason: string | null;
  actorId: string;
  reversalOfId?: string;
};

export function createCardStatementPayment(input: CreateCardStatementPaymentInput, tx: PrismaTransactionClient): Promise<CardStatementPayment> {
  return tx.cardStatementPayment.create({ data: input });
}

export function findCardStatementPaymentByIdempotencyKey(organizationId: string, cardStatementId: string, idempotencyKey: string, tx?: PrismaTransactionClient): Promise<CardStatementPayment | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.cardStatementPayment.findFirst({ where: { organizationId, cardStatementId, idempotencyKey } });
}

export function findCardStatementPaymentByReversalOfId(organizationId: string, reversalOfId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.cardStatementPayment.findFirst({ where: { organizationId, reversalOfId }, include: { movement: true } });
}

export function findCardStatementPaymentForReversal(organizationId: string, id: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.cardStatementPayment.findFirst({ where: { id, organizationId }, include: { movement: true, reversal: true } });
}

export type CreateCardStatementPaymentMovementInput = {
  organizationId: string;
  financialAccountId: string;
  cardStatementPaymentId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  occurredAt: Date;
  direction: MoneyDirection;
  provenance: Prisma.InputJsonValue;
  reversalOfId?: string;
};

export function createCardStatementPaymentMovement(input: CreateCardStatementPaymentMovementInput, tx: PrismaTransactionClient): Promise<FinancialAccountMovement> {
  return tx.financialAccountMovement.create({ data: input });
}

export async function sumNetCardStatementPayments(organizationId: string, cardStatementId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.cardStatementPayment.aggregate({ where: { organizationId, cardStatementId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.cardStatementPayment.aggregate({ where: { organizationId, cardStatementId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}
