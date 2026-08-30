import type { FinancialAccountMovement, MoneyDirection, Prisma, PaymentMethod, SettlementKind, SupplierPayment } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

/**
 * Immutable contract — settlement.repository.ts / expense-settlement.repository.ts
 * ile aynı kural: bilerek hiçbir update/delete fonksiyonu yoktur. Bir
 * düzeltme her zaman reverseSupplierPayment ile yeni bir REVERSAL satırı
 * üretir.
 */

export type CreateSupplierPaymentInput = {
  organizationId: string;
  purchaseInvoiceId: string;
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

export function createSupplierPayment(input: CreateSupplierPaymentInput, tx: PrismaTransactionClient): Promise<SupplierPayment> {
  return tx.supplierPayment.create({ data: input });
}

export function findSupplierPaymentByIdempotencyKey(
  organizationId: string,
  purchaseInvoiceId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<SupplierPayment | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.supplierPayment.findFirst({ where: { organizationId, purchaseInvoiceId, idempotencyKey } });
}

export function findSupplierPaymentByReversalOfId(organizationId: string, reversalOfId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.supplierPayment.findFirst({ where: { organizationId, reversalOfId }, include: { movement: true } });
}

export type CreateSupplierPaymentMovementInput = {
  organizationId: string;
  financialAccountId: string;
  supplierPaymentId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  occurredAt: Date;
  direction: MoneyDirection;
  provenance: Prisma.InputJsonValue;
  reversalOfId?: string;
};

export function createSupplierPaymentMovement(input: CreateSupplierPaymentMovementInput, tx: PrismaTransactionClient): Promise<FinancialAccountMovement> {
  return tx.financialAccountMovement.create({ data: input });
}

export function findSupplierPaymentForReversal(organizationId: string, supplierPaymentId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.supplierPayment.findFirst({
    where: { id: supplierPaymentId, organizationId },
    include: { movement: true, reversal: true },
  });
}

/**
 * PurchaseInvoice.paidAmount'ın self-healing kaynağı — sumNetApplications /
 * sumNetExpenseSettlements ile aynı desen: ORIGINAL toplamından REVERSAL
 * toplamı çıkarılır.
 */
export async function sumNetSupplierPayments(organizationId: string, purchaseInvoiceId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.supplierPayment.aggregate({ where: { organizationId, purchaseInvoiceId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.supplierPayment.aggregate({ where: { organizationId, purchaseInvoiceId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}
