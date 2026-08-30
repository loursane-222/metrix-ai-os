import type {
  ObligationDirection,
  ObligationScheduleLine,
  ObligationSourceType,
  PaymentTermAllocationType,
  PaymentTermMaturityBasis,
  PaymentTermReferenceDateType,
} from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

/**
 * Immutable contract: bilerek hiçbir update/delete fonksiyonu yoktur ve
 * asla eklenmez. Bir schedule line materialize edildikten sonra ticari
 * gerçeği temsil eder — düzeltme gerekiyorsa ilgili Invoice/Expense'in
 * kendi cancel/void yoluyla ele alınır, bu satır mutate edilmez.
 */

export type CreateObligationScheduleLineInput = {
  organizationId: string;
  direction: ObligationDirection;
  sourceType: ObligationSourceType;
  sourceId: string;
  componentIndex: number;
  allocationType: PaymentTermAllocationType;
  maturityBasis: PaymentTermMaturityBasis;
  referenceDateType: PaymentTermReferenceDateType | null;
  dueDate: Date;
  originalAmount: number;
  currency: string;
  paymentId?: string;
  expenseId?: string;
  purchaseInvoiceId?: string;
  actorId: string;
};

export function createObligationScheduleLine(input: CreateObligationScheduleLineInput, tx: PrismaTransactionClient): Promise<ObligationScheduleLine> {
  return tx.obligationScheduleLine.create({ data: input });
}

export function findObligationScheduleLinesForSource(
  organizationId: string,
  sourceType: ObligationSourceType,
  sourceId: string,
  tx?: PrismaTransactionClient,
): Promise<ObligationScheduleLine[]> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.obligationScheduleLine.findMany({ where: { organizationId, sourceType, sourceId }, orderBy: { componentIndex: "asc" } });
}

export function findObligationScheduleLineForPayment(organizationId: string, paymentId: string, tx?: PrismaTransactionClient): Promise<ObligationScheduleLine | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.obligationScheduleLine.findFirst({ where: { organizationId, paymentId } });
}

export function findObligationScheduleLineForExpense(organizationId: string, expenseId: string, tx?: PrismaTransactionClient): Promise<ObligationScheduleLine | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.obligationScheduleLine.findFirst({ where: { organizationId, expenseId } });
}

export function findObligationScheduleLineForPurchaseInvoice(organizationId: string, purchaseInvoiceId: string, tx?: PrismaTransactionClient): Promise<ObligationScheduleLine | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.obligationScheduleLine.findFirst({ where: { organizationId, purchaseInvoiceId } });
}
