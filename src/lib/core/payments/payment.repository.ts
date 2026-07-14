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
