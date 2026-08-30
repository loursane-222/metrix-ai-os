import type { ExpenseSettlement, FinancialAccountMovement, MoneyDirection, Prisma, PaymentMethod, SettlementKind } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

/**
 * Immutable contract: Settlement/settlement.repository.ts ile aynı kural —
 * bilerek hiçbir update/delete fonksiyonu yoktur. Bir düzeltme her zaman
 * reverseExpenseSettlement ile yeni bir REVERSAL satırı üretir.
 */

export type CreateExpenseSettlementInput = {
  organizationId: string;
  expenseId: string;
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

export function createExpenseSettlement(input: CreateExpenseSettlementInput, tx: PrismaTransactionClient): Promise<ExpenseSettlement> {
  return tx.expenseSettlement.create({ data: input });
}

export function findExpenseSettlementByIdempotencyKey(
  organizationId: string,
  expenseId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<ExpenseSettlement | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.expenseSettlement.findFirst({ where: { organizationId, expenseId, idempotencyKey } });
}

export function findExpenseSettlementByReversalOfId(
  organizationId: string,
  reversalOfId: string,
  tx?: PrismaTransactionClient,
) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.expenseSettlement.findFirst({ where: { organizationId, reversalOfId }, include: { movement: true } });
}

export type CreateExpenseSettlementMovementInput = {
  organizationId: string;
  financialAccountId: string;
  expenseSettlementId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  occurredAt: Date;
  direction: MoneyDirection;
  provenance: Prisma.InputJsonValue;
  reversalOfId?: string;
};

export function createExpenseSettlementMovement(input: CreateExpenseSettlementMovementInput, tx: PrismaTransactionClient): Promise<FinancialAccountMovement> {
  return tx.financialAccountMovement.create({ data: input });
}

export function findExpenseSettlementForReversal(organizationId: string, expenseSettlementId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.expenseSettlement.findFirst({
    where: { id: expenseSettlementId, organizationId },
    include: { movement: true, reversal: true },
  });
}

/**
 * Expense.paidAmount'ın self-healing kaynağı — sumNetApplications
 * (settlement.repository.ts) ile aynı desen: ORIGINAL toplamından REVERSAL
 * toplamı çıkarılır.
 */
export async function sumNetExpenseSettlements(organizationId: string, expenseId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.expenseSettlement.aggregate({ where: { organizationId, expenseId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.expenseSettlement.aggregate({ where: { organizationId, expenseId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}
