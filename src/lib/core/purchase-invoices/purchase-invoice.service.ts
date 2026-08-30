import { ApiValidationError } from "@/lib/api/validation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";
import { computeLineNetCents, computeLineTotalCents, computeQuoteTotalCents, centsToAmount } from "@/lib/core/quotes/quote-totals";
import { findReceivedQuantityRowsForPurchaseOrderItem } from "@/lib/core/goods-receipts/goods-receipt.repository";
import { recordPurchaseInvoiceConfirmed } from "@/lib/accounting/ledger.service";
import { computeRequestHash, isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";

import {
  countPurchaseInvoicesForOrganization,
  createPurchaseInvoice,
  createPurchaseInvoiceItems,
  findInvoicedQuantityRowsForPurchaseOrderItem,
  findPurchaseInvoiceByIdempotencyKey,
  findPurchaseInvoiceById as findPurchaseInvoiceByIdFromRepository,
  markPurchaseInvoiceConfirmed,
  markPurchaseInvoiceVoided,
} from "./purchase-invoice.repository";
import type { CreatePurchaseInvoiceFromPurchaseOrderInput, PurchaseInvoiceResult } from "./purchase-invoice.types";

const DEFAULT_TAX_RATE = 20;

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

export async function findPurchaseInvoiceById(purchaseInvoiceId: string, organizationId: string): Promise<PurchaseInvoiceResult | null> {
  assert(purchaseInvoiceId, "purchaseInvoiceId");
  assert(organizationId, "organizationId");
  return findPurchaseInvoiceByIdFromRepository(purchaseInvoiceId, organizationId);
}

/**
 * Phase 9 canonical Purchase Invoice line/item authority + over-invoicing
 * ceiling. createInvoiceFromOrder'ın (sales) birebir aynı mimarisi: her
 * PurchaseOrderItem satırı FOR UPDATE ile kilitlenir (id sıralı,
 * deadlock'suz), remaining = toplam CANCELLED-olmayan GoodsReceipt'te
 * teslim alınmış miktar eksi toplam CANCELLED-olmayan faturalanmış miktar.
 * Lines PurchaseOrder'ın KENDİ PurchaseOrderItem satırlarından türetilir —
 * hiçbir Quote/Order sales-side model'i asla okunmaz. Totaller sunucu
 * tarafında lines'tan deterministik hesaplanır (quote-totals.ts, reuse).
 */
export async function createPurchaseInvoiceFromPurchaseOrder(input: CreatePurchaseInvoiceFromPurchaseOrderInput): Promise<PurchaseInvoiceResult> {
  assert(input.organizationId, "organizationId");
  assert(input.sourcePurchaseOrderId, "sourcePurchaseOrderId");
  assert(input.supplierInvoiceNumber, "supplierInvoiceNumber");

  const idempotencyKey = input.idempotencyKey ?? null;

  if (idempotencyKey) {
    const existing = await findPurchaseInvoiceByIdempotencyKey(input.organizationId, idempotencyKey);
    if (existing) return existing;
  }

  try {
    return await prisma.$transaction((tx) => performCreate(tx, input, idempotencyKey));
  } catch (error) {
    if (idempotencyKey && isIdempotencyKeyCollision(error)) {
      const existing = await findPurchaseInvoiceByIdempotencyKey(input.organizationId, idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  }
}

async function performCreate(tx: Prisma.TransactionClient, input: CreatePurchaseInvoiceFromPurchaseOrderInput, idempotencyKey: string | null): Promise<PurchaseInvoiceResult> {
  const purchaseOrder = await tx.purchaseOrder.findFirst({
    where: { id: input.sourcePurchaseOrderId, organizationId: input.organizationId },
    include: { items: true },
  });
  if (!purchaseOrder) throw new ApiValidationError("PurchaseOrder not found.", 404);

  if (input.sourceGoodsReceiptId) {
    const goodsReceipt = await tx.goodsReceipt.findFirst({ where: { id: input.sourceGoodsReceiptId, organizationId: input.organizationId, sourcePurchaseOrderId: input.sourcePurchaseOrderId } });
    if (!goodsReceipt) throw new ApiValidationError("GoodsReceipt not found for this PurchaseOrder.", 404);
  }

  const requestedItems = input.items ?? purchaseOrder.items.map((item) => ({ purchaseOrderItemId: item.id, quantity: Number(item.quantity) }));
  if (!requestedItems.length) throw new ApiValidationError("No items to invoice.", 400);

  // Same FOR UPDATE + ORDER BY id pattern as Phase 6/7/8's ceiling guards.
  const purchaseOrderItemIds = [...new Set(requestedItems.map((r) => r.purchaseOrderItemId))];
  await tx.$queryRaw`SELECT id FROM "PurchaseOrderItem" WHERE id = ANY(${purchaseOrderItemIds}) AND "organizationId" = ${input.organizationId} ORDER BY id FOR UPDATE`;

  const lineInputs = await Promise.all(
    requestedItems.map(async (req) => {
      const orderItem = purchaseOrder.items.find((i) => i.id === req.purchaseOrderItemId);
      if (!orderItem) throw new ApiValidationError(`PurchaseOrderItem ${req.purchaseOrderItemId} does not belong to this PurchaseOrder.`, 400);

      const receivedRows = await findReceivedQuantityRowsForPurchaseOrderItem(req.purchaseOrderItemId, input.organizationId, tx);
      const totalReceived = receivedRows.reduce((sum, r) => sum + Number(r.quantity), 0);
      const invoicedRows = await findInvoicedQuantityRowsForPurchaseOrderItem(req.purchaseOrderItemId, input.organizationId, tx);
      const totalInvoiced = invoicedRows.reduce((sum, r) => sum + Number(r.quantity), 0);
      const remaining = totalReceived - totalInvoiced;
      if (req.quantity > remaining) {
        throw new ApiValidationError(
          `Faturalanan miktar teslim alınan miktarı aşıyor: ${orderItem.name} (teslim alınan: ${totalReceived}, zaten faturalanmış: ${totalInvoiced}, istenen: ${req.quantity}).`,
          409,
        );
      }

      return {
        purchaseOrderItemId: req.purchaseOrderItemId,
        productServiceId: orderItem.productServiceId ?? undefined,
        name: orderItem.name,
        unit: orderItem.unit ?? undefined,
        quantity: req.quantity,
        unitPriceCents: orderItem.unitPriceCents,
        discountBasisPoints: orderItem.discountBasisPoints,
        vatRateBasisPoints: orderItem.vatRateBasisPoints,
        sortOrder: orderItem.sortOrder,
      };
    }),
  );

  const lineTotalsCents = lineInputs.map((line) => computeLineTotalCents(line));
  const netCentsPerLine = lineInputs.map((line) => computeLineNetCents(line));
  const sumLineTotalCents = lineTotalsCents.reduce((sum, cents) => sum + cents, BigInt(0));
  const sumNetCents = netCentsPerLine.reduce((sum, cents) => sum + cents, BigInt(0));
  // PurchaseOrder Phase 9'da generalDiscountBasisPoints taşımaz (sales
  // Order'ın aksine — PO'nun kendi kapsamı bunu gerektirmiyor); yalnız
  // per-line discount/vat ile hesap yeterli.
  const totalAmountCents = computeQuoteTotalCents(lineTotalsCents, null);
  const amountCents = sumLineTotalCents === BigInt(0) ? BigInt(0) : (totalAmountCents * sumNetCents) / sumLineTotalCents;
  const taxAmountCents = totalAmountCents - amountCents;

  const amount = centsToAmount(amountCents);
  const taxAmount = centsToAmount(taxAmountCents);
  const totalAmount = centsToAmount(totalAmountCents);
  const taxRate = amountCents === BigInt(0) ? 0 : Math.round((Number(taxAmountCents) / Number(amountCents)) * 10000) / 100;

  const requestHash = idempotencyKey
    ? computeRequestHash({ sourcePurchaseOrderId: input.sourcePurchaseOrderId, supplierInvoiceNumber: input.supplierInvoiceNumber, items: requestedItems })
    : null;

  const purchaseInvoice = await createPurchaseInvoice(
    {
      organizationId: input.organizationId,
      supplierId: purchaseOrder.supplierId,
      purchaseOrderId: purchaseOrder.id,
      sourceGoodsReceiptId: input.sourceGoodsReceiptId ?? null,
      supplierInvoiceNumber: input.supplierInvoiceNumber,
      amount,
      taxRate,
      taxAmount,
      totalAmount,
      currency: purchaseOrder.currency,
      dueDate: input.dueDate,
      notes: input.notes,
      idempotencyKey,
      requestHash,
    },
    tx,
  );

  await createPurchaseInvoiceItems(
    purchaseInvoice.id,
    input.organizationId,
    lineInputs.map((line, index) => ({ ...line, lineTotalCents: lineTotalsCents[index]! })),
    tx,
  );

  return purchaseInvoice;
}

/**
 * invoice.send'in payable karşılığı — DRAFT→CONFIRMED, ekonomik tanımayı
 * ledger'a postalar. Obligation materialization BURADA değil, çağıran
 * Action Runtime handler'da (purchase-invoice-confirm-handler.ts)
 * NON-CRITICAL bir devam adımı olarak tetiklenir — invoice.send/
 * sendInvoice ile aynı ayrım (bkz. invoice-send-handler.ts).
 */
export async function confirmPurchaseInvoice(input: { purchaseInvoiceId: string; organizationId: string }): Promise<PurchaseInvoiceResult> {
  assert(input.purchaseInvoiceId, "purchaseInvoiceId");
  assert(input.organizationId, "organizationId");

  return prisma.$transaction(async (tx) => {
    const purchaseInvoice = await markPurchaseInvoiceConfirmed(input.purchaseInvoiceId, input.organizationId, tx);
    if (purchaseInvoice) {
      await recordPurchaseInvoiceConfirmed({
        tx,
        organizationId: input.organizationId,
        purchaseInvoiceId: purchaseInvoice.id,
        entryDate: new Date(),
        netAmount: purchaseInvoice.amount,
        taxAmount: purchaseInvoice.taxAmount,
        totalAmount: purchaseInvoice.totalAmount,
        currency: purchaseInvoice.currency,
      });
      return purchaseInvoice;
    }

    const existing = await findPurchaseInvoiceByIdFromRepository(input.purchaseInvoiceId, input.organizationId, tx);
    if (!existing) throw new ApiValidationError("PurchaseInvoice not found.", 404);
    throw new ApiValidationError("Only draft purchase invoices can be confirmed.", 409);
  });
}

// voidInvoice ile aynı gerekçe: yalnız hiç settlement başlamamış (DRAFT)
// bir purchase invoice iptal edilebilir — gerçekleşmiş bir ekonomik
// tanımayı (CONFIRMED+) sessizce geri almaz.
export async function voidPurchaseInvoice(input: { purchaseInvoiceId: string; organizationId: string }): Promise<PurchaseInvoiceResult> {
  assert(input.purchaseInvoiceId, "purchaseInvoiceId");
  assert(input.organizationId, "organizationId");

  const voided = await markPurchaseInvoiceVoided(input.purchaseInvoiceId, input.organizationId);
  if (voided) return voided;

  const existing = await findPurchaseInvoiceByIdFromRepository(input.purchaseInvoiceId, input.organizationId);
  if (!existing) throw new ApiValidationError("PurchaseInvoice not found.", 404);
  throw new ApiValidationError("Only draft purchase invoices can be voided.", 409);
}

export async function listPurchaseInvoices(organizationId: string) {
  assert(organizationId, "organizationId");
  return prisma.purchaseInvoice.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function countPurchaseInvoices(organizationId: string): Promise<number> {
  assert(organizationId, "organizationId");
  return countPurchaseInvoicesForOrganization(organizationId);
}
