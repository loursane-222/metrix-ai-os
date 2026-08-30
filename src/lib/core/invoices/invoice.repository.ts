import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma } from "@prisma/client";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateInvoiceRepositoryInput, InvoiceItemInput, InvoiceResult } from "./invoice.types";

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
      orderId: input.orderId ?? null,
      deliveryId: input.deliveryId ?? null,
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
  return client.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
}

export function createInvoiceItems(
  invoiceId: string,
  organizationId: string,
  items: InvoiceItemInput[],
  tx?: PrismaTransactionClient,
) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.invoiceItem.createMany({
    data: items.map((item, index) => ({
      organizationId,
      invoiceId,
      orderItemId: item.orderItemId ?? null,
      productServiceId: item.productServiceId ?? null,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      discountBasisPoints: item.discountBasisPoints ?? 0,
      vatRateBasisPoints: item.vatRateBasisPoints ?? 0,
      lineTotalCents: item.lineTotalCents,
      sortOrder: item.sortOrder ?? index,
    })),
  });
}

/**
 * Bir OrderItem'a karşı bugüne kadar (CANCELLED olmayan herhangi bir
 * Invoice'ta) faturalanmış toplam miktarı hesaplamak için ham satırlar.
 * createInvoiceFromOrder'ın over-invoicing ceiling'i bunu
 * sumDeliveredQuantityForOrderItem (delivery.repository.ts) ile birlikte
 * kullanır: remaining = dispatched - invoiced.
 */
export function findInvoicedQuantityRowsForOrderItem(
  orderItemId: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.invoiceItem.findMany({
    where: { orderItemId, organizationId, invoice: { status: { not: "CANCELLED" } } },
    select: { quantity: true },
  });
}

export async function findInvoiceByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<InvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.invoice.findFirst({ where: { organizationId, idempotencyKey } });
}
