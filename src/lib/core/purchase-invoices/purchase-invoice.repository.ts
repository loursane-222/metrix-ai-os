import { prisma } from "@/lib/core/shared/prisma";
import type { Prisma, PurchaseInvoiceStatus } from "@prisma/client";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreatePurchaseInvoiceRepositoryInput, PurchaseInvoiceItemInput, PurchaseInvoiceResult } from "./purchase-invoice.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function countPurchaseInvoicesForOrganization(organizationId: string, tx?: PrismaTransactionClient): Promise<number> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.purchaseInvoice.count({ where: { organizationId } });
}

export async function createPurchaseInvoice(input: CreatePurchaseInvoiceRepositoryInput, tx?: PrismaTransactionClient): Promise<PurchaseInvoiceResult> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.purchaseInvoice.create({
    data: {
      organizationId: input.organizationId,
      supplierId: input.supplierId,
      purchaseOrderId: input.purchaseOrderId,
      sourceGoodsReceiptId: input.sourceGoodsReceiptId,
      supplierInvoiceNumber: input.supplierInvoiceNumber,
      amount: input.amount,
      taxRate: input.taxRate,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      currency: input.currency,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash: input.requestHash ?? null,
    },
  });
}

export function createPurchaseInvoiceItems(purchaseInvoiceId: string, organizationId: string, items: PurchaseInvoiceItemInput[], tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.purchaseInvoiceItem.createMany({
    data: items.map((item, index) => ({
      organizationId,
      purchaseInvoiceId,
      purchaseOrderItemId: item.purchaseOrderItemId,
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
 * Bir PurchaseOrderItem'a karşı bugüne kadar (CANCELLED olmayan herhangi bir
 * PurchaseInvoice'ta) faturalanmış toplam miktarı hesaplamak için ham
 * satırlar — createPurchaseInvoiceFromPurchaseOrder'ın over-invoicing
 * ceiling'i bunu findReceivedQuantityRowsForPurchaseOrderItem (goods-receipt
 * domain) ile birlikte kullanır: remaining = received - invoiced.
 */
export function findInvoicedQuantityRowsForPurchaseOrderItem(purchaseOrderItemId: string, organizationId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.purchaseInvoiceItem.findMany({
    where: { purchaseOrderItemId, organizationId, purchaseInvoice: { status: { not: "CANCELLED" } } },
    select: { quantity: true },
  });
}

export async function findPurchaseInvoiceById(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<PurchaseInvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.purchaseInvoice.findFirst({ where: { id, organizationId } });
}

export async function findPurchaseInvoiceByIdempotencyKey(organizationId: string, idempotencyKey: string, tx?: PrismaTransactionClient): Promise<PurchaseInvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.purchaseInvoice.findFirst({ where: { organizationId, idempotencyKey } });
}

export async function markPurchaseInvoiceConfirmed(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<PurchaseInvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const updated = await client.purchaseInvoice.updateMany({ where: { id, organizationId, status: "DRAFT" }, data: { status: "CONFIRMED" } });
  if (updated.count !== 1) return null;
  return client.purchaseInvoice.findFirst({ where: { id, organizationId } });
}

export async function markPurchaseInvoiceVoided(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<PurchaseInvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const updated = await client.purchaseInvoice.updateMany({ where: { id, organizationId, status: "DRAFT" }, data: { status: "CANCELLED" } });
  if (updated.count !== 1) return null;
  return client.purchaseInvoice.findFirst({ where: { id, organizationId } });
}

export class SupplierPaymentConcurrentlyModifiedError extends Error {
  constructor(purchaseInvoiceId: string) {
    super(`PurchaseInvoice ${purchaseInvoiceId} was concurrently modified.`);
    this.name = "SupplierPaymentConcurrentlyModifiedError";
  }
}

/**
 * payment.repository.ts::applyPaymentAmount / expense-repository.ts::
 * applyExpenseSettlementAmount ile aynı CAS deseni — PurchaseInvoice.
 * paidAmount/status için.
 */
export async function applySupplierPaymentAmount(
  input: { id: string; organizationId: string; paidAmount: number; status: PurchaseInvoiceStatus; expectedPriorPaidAmount?: number },
  tx?: PrismaTransactionClient,
): Promise<PurchaseInvoiceResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const result = await client.purchaseInvoice.updateMany({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      ...(input.expectedPriorPaidAmount !== undefined ? { paidAmount: input.expectedPriorPaidAmount } : {}),
    },
    data: { paidAmount: input.paidAmount, status: input.status },
  });
  if (result.count === 0) {
    if (input.expectedPriorPaidAmount !== undefined) {
      const stillExists = await client.purchaseInvoice.findFirst({ where: { id: input.id, organizationId: input.organizationId }, select: { id: true } });
      if (stillExists) throw new SupplierPaymentConcurrentlyModifiedError(input.id);
    }
    return null;
  }
  return client.purchaseInvoice.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
}

export type { Prisma };
