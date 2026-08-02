import type { PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreatePaymentRepositoryInput, PaymentResult } from "./payment.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createPayment(
  input: CreatePaymentRepositoryInput,
  tx?: PrismaTransactionClient,
): Promise<PaymentResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.payment.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      personId: input.personId,
      quoteId: input.quoteId,
      title: input.title,
      amount: input.amount,
      currency: input.currency ?? "TRY",
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash: input.requestHash ?? null,
    },
  });
}

export async function listPaymentsForOrganization(organizationId: string): Promise<PaymentResult[]> {
  return prisma.payment.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
}

export async function findPaymentByIdForOrganization(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<PaymentResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.payment.findFirst({
    where: { id, organizationId },
  });
}

/**
 * Tenant-safe koşullu güncelleme: updateMany + organizationId where'i,
 * başka bir organizasyona ait bir id ile eşleşmeyi imkansız kılar. count
 * 0 ise (organizasyonda) kayıt bulunamadı demektir — çağıran null görür.
 */
export async function applyPaymentAmount(
  input: { id: string; organizationId: string; paidAmount: number; status: PaymentStatus; paidAt: Date | null },
  tx?: PrismaTransactionClient,
): Promise<PaymentResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.payment.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: { paidAmount: input.paidAmount, status: input.status, paidAt: input.paidAt },
  });

  if (result.count === 0) return null;

  return client.payment.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
}

export async function findByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<PaymentResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.payment.findFirst({
    where: { organizationId, idempotencyKey },
  });
}
