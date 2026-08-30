import type { Application, FinancialAccountMovement, MoneyDirection, Prisma, PaymentMethod, Settlement, SettlementKind } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

/**
 * Immutable contract: Settlement, Application ve FinancialAccountMovement
 * için bilerek hiçbir update/delete fonksiyonu yoktur ve asla eklenmez.
 * Bir düzeltme her zaman settlement.reverse ile yeni bir REVERSAL satırı
 * üretir — var olan bir satır asla yerinde değiştirilmez veya silinmez. Bu
 * dosyaya bir update/delete fonksiyonu eklemek bu invariant'ı bozar; bkz.
 * settlement.boundary.test.ts.
 */

export type CreateSettlementInput = {
  organizationId: string;
  paymentId: string;
  kind: SettlementKind;
  direction: MoneyDirection;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  financialAccountId: string;
  occurredAt: Date;
  idempotencyKey: string | null;
  requestHash: string | null;
  reason: string | null;
  referenceNumber?: string | null;
  externalReference?: string | null;
  actorId: string;
  reversalOfId?: string;
};

export function createSettlement(input: CreateSettlementInput, tx: PrismaTransactionClient): Promise<Settlement> {
  return tx.settlement.create({ data: input });
}

export type CreateApplicationInput = {
  organizationId: string;
  settlementId: string;
  paymentId: string;
  kind: SettlementKind;
  amount: number;
  currency: string;
  appliedAt: Date;
  reversalOfId?: string;
};

export function createApplication(input: CreateApplicationInput, tx: PrismaTransactionClient): Promise<Application> {
  return tx.application.create({ data: input });
}

export type CreateMovementInput = {
  organizationId: string;
  financialAccountId: string;
  settlementId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  occurredAt: Date;
  direction: MoneyDirection;
  provenance: Prisma.InputJsonValue;
  reversalOfId?: string;
};

export function createMovement(input: CreateMovementInput, tx: PrismaTransactionClient): Promise<FinancialAccountMovement> {
  return tx.financialAccountMovement.create({ data: input });
}

export function findSettlementByIdempotencyKey(
  organizationId: string,
  paymentId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<Settlement | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.settlement.findFirst({ where: { organizationId, paymentId, idempotencyKey } });
}

export function findSettlementForReversal(
  organizationId: string,
  settlementId: string,
  tx?: PrismaTransactionClient,
) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.settlement.findFirst({
    where: { id: settlementId, organizationId },
    include: { applications: true, movements: true, reversal: true },
  });
}

/**
 * Payment.paidAmount'ın self-healing kaynağı: blind decrement yerine, o
 * payment'a ait tüm ORIGINAL Application'ların toplamından tüm REVERSAL
 * Application'ların toplamı çıkarılarak yeniden hesaplanır. Bir reversal
 * PAID'i PARTIAL'a geri döndürebilir.
 */
export async function sumNetApplications(organizationId: string, paymentId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.application.aggregate({ where: { organizationId, paymentId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.application.aggregate({ where: { organizationId, paymentId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}
