import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma } from "@prisma/client";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateInvoiceRepositoryInput, InvoiceResult } from "./invoice.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function countInvoicesForOrganization(
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<number> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.invoice.count({ where: { organizationId } });
}

export async function createInvoice(
  input: CreateInvoiceRepositoryInput,
  tx?: PrismaTransactionClient,
): Promise<InvoiceResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.invoice.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      quoteId: input.quoteId,
      invoiceNumber: input.invoiceNumber,
      title: input.title,
      amount: input.amount,
      taxRate: input.taxRate,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      currency: input.currency ?? "TRY",
      dueDate: input.dueDate ?? null,
      paymentTermSnapshot: input.paymentTermSnapshot as Prisma.InputJsonValue | undefined,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash: input.requestHash ?? null,
    },
  });
}

export async function listInvoicesForOrganization(organizationId: string): Promise<InvoiceResult[]> {
  return prisma.invoice.findMany({
    where: { organizationId },
    include: { payments: { select: { id: true, title: true, amount: true, paidAmount: true, status: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
}

export async function markInvoiceSent(
  invoiceId: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<InvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const updated = await client.invoice.updateMany({
    where: { id: invoiceId, organizationId, status: "DRAFT" },
    data: { status: "SENT" },
  });
  if (updated.count !== 1) return null;
  return client.invoice.findFirst({ where: { id: invoiceId, organizationId } });
}

export async function markInvoiceVoided(
  invoiceId: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<InvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const updated = await client.invoice.updateMany({
    where: { id: invoiceId, organizationId, status: "DRAFT" },
    data: { status: "CANCELLED" },
  });
  if (updated.count !== 1) return null;
  return client.invoice.findFirst({ where: { id: invoiceId, organizationId } });
}

export async function findInvoiceById(
  invoiceId: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<InvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.invoice.findFirst({ where: { id: invoiceId, organizationId } });
}

export async function findInvoiceByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<InvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.invoice.findFirst({ where: { organizationId, idempotencyKey } });
}
