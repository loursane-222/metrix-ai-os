import { ApiValidationError } from "@/lib/api/validation";
import { getCustomerById } from "@/lib/core/customers/customer.repository";
import { findQuoteByIdForOrganization } from "@/lib/core/quotes/quote.service";
import { computeLineNetCents, computeLineTotalCents, computeQuoteTotalCents, centsToAmount } from "@/lib/core/quotes/quote-totals";
import { sumDeliveredQuantityForOrderItem } from "@/lib/core/deliveries/delivery.repository";
import { computeRequestHash, isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import { recordInvoiceSent } from "@/lib/accounting/ledger.service";

import {
  countInvoicesForOrganization,
  createInvoice,
  createInvoiceItems,
  findInvoiceById as findInvoiceByIdFromRepository,
  findInvoiceByIdempotencyKey,
  findInvoicedQuantityRowsForOrderItem,
  listInvoicesForOrganization,
  markInvoiceSent,
  markInvoiceVoided,
} from "./invoice.repository";
import type { CreateInvoiceFromOrderInput, CreateInvoiceInput, CreateInvoiceOutcome, InvoiceResult } from "./invoice.types";
import { parseStructuredPaymentTerm, validatePaymentTermForDocument } from "@/lib/payment-terms";

const DEFAULT_CURRENCY = "TRY";
const DEFAULT_TAX_RATE = 20;

export async function createNewInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceOutcome> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.customerId, "customerId");
  assertNonEmpty(input.title, "title");
  assertValidAmount(input.amount);

  const customer = await getCustomerById(input.customerId, input.organizationId);
  if (!customer) {
    throw new ApiValidationError("Customer not found.", 404);
  }

  const quoteId = await resolveValidatedQuoteId(input.organizationId, input.customerId, input.quoteId);

  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE;
  assertValidTaxRate(taxRate);
  const taxAmount = roundMoney((input.amount * taxRate) / 100);
  const totalAmount = roundMoney(input.amount + taxAmount);
  const normalizedCurrency = normalizeCurrency(input.currency);
  const paymentTermSnapshot = input.paymentTermSnapshot ? parseStructuredPaymentTerm(input.paymentTermSnapshot) : undefined;
  if (paymentTermSnapshot) validatePaymentTermForDocument(paymentTermSnapshot, BigInt(Math.round(totalAmount * 100)), normalizedCurrency);
  const normalizedDueDate = input.dueDate ? input.dueDate.toISOString() : null;
  const idempotencyKey = input.idempotencyKey ?? null;
  const requestHash = idempotencyKey
    ? computeRequestHash({
        customerId: input.customerId,
        quoteId,
        title: input.title,
        amount: input.amount,
        taxRate,
        currency: normalizedCurrency,
        dueDate: normalizedDueDate,
        notes: input.notes ?? null,
      })
    : null;

  try {
    const invoiceNumber = input.invoiceNumber?.trim() || await nextInvoiceNumber(input.organizationId);
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await createInvoice(
        {
          organizationId: input.organizationId,
          customerId: input.customerId,
          quoteId,
          invoiceNumber,
          title: input.title,
          amount: input.amount,
          taxRate,
          taxAmount,
          totalAmount,
          currency: normalizedCurrency,
          dueDate: input.dueDate,
          paymentTermSnapshot,
          notes: input.notes,
          idempotencyKey,
          requestHash,
        },
        tx,
      );

      // Manual invoices carry no Order/OrderItem — InvoiceItem is still the
      // one canonical line authority for every invoice, so a single line is
      // materialized here rather than leaving manual invoices as a second,
      // line-less representation. This line is a deterministic MIRROR of
      // the header fields just computed above (unitPriceCents/lineTotalCents
      // set directly from amount/totalAmount), never an independent
      // recomputation — so it can never drift from the header it mirrors.
      // No fake product/orderItem is invented: productServiceId/orderItemId
      // stay null, and name reuses the invoice's own real title.
      await createInvoiceItems(
        created.id,
        input.organizationId,
        [
          {
            name: input.title,
            quantity: 1,
            unitPriceCents: BigInt(Math.round(input.amount * 100)),
            discountBasisPoints: 0,
            vatRateBasisPoints: Math.round(taxRate * 100),
            lineTotalCents: BigInt(Math.round(totalAmount * 100)),
            sortOrder: 0,
          },
        ],
        tx,
      );

      return created;
    });

    return { created: true, invoice };
  } catch (error) {
    if (idempotencyKey && isIdempotencyKeyCollision(error)) {
      return resolveIdempotentReplay(input.organizationId, idempotencyKey, requestHash);
    }

    throw error;
  }
}

export async function listInvoices(organizationId: string): Promise<InvoiceResult[]> {
  assertNonEmpty(organizationId, "organizationId");
  return listInvoicesForOrganization(organizationId);
}

// listInvoicesForOrganization caps at 100 rows — the real total, unbounded
// by that cap, for callers that need to display "how many total" rather
// than "how many loaded".
export async function countInvoices(organizationId: string): Promise<number> {
  assertNonEmpty(organizationId, "organizationId");
  return countInvoicesForOrganization(organizationId);
}

export async function findInvoiceById(invoiceId: string, organizationId: string): Promise<InvoiceResult | null> {
  assertNonEmpty(invoiceId, "invoiceId");
  assertNonEmpty(organizationId, "organizationId");
  return findInvoiceByIdFromRepository(invoiceId, organizationId);
}

export async function sendInvoice(input: {
  invoiceId: string;
  organizationId: string;
}): Promise<InvoiceResult> {
  assertNonEmpty(input.invoiceId, "invoiceId");
  assertNonEmpty(input.organizationId, "organizationId");

  return prisma.$transaction(async (tx) => {
    const invoice = await markInvoiceSent(input.invoiceId, input.organizationId, tx);
    if (invoice) {
      await recordInvoiceSent({
        tx,
        organizationId: input.organizationId,
        invoiceId: invoice.id,
        entryDate: new Date(),
        netAmount: invoice.amount,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
      });
      return invoice;
    }

    const existing = await findInvoiceByIdFromRepository(input.invoiceId, input.organizationId, tx);
    if (!existing) throw new ApiValidationError("Invoice not found.", 404);
    throw new ApiValidationError("Only draft invoices can be marked as sent.", 409);
  });
}

// Only a DRAFT invoice can be voided — one that's already SENT/PAID
// represents a real, external commercial fact (matches sendInvoice's own
// DRAFT-only transition guard). Safe to void unconditionally at DRAFT: no
// e-Fatura/government filing integration exists yet (see invoices.actions.ts),
// so a DRAFT Invoice row is purely internal, not yet issued anywhere.
export async function voidInvoice(input: {
  invoiceId: string;
  organizationId: string;
}): Promise<InvoiceResult> {
  assertNonEmpty(input.invoiceId, "invoiceId");
  assertNonEmpty(input.organizationId, "organizationId");

  const voided = await markInvoiceVoided(input.invoiceId, input.organizationId);
  if (voided) return voided;

  const existing = await findInvoiceByIdFromRepository(input.invoiceId, input.organizationId);
  if (!existing) throw new ApiValidationError("Invoice not found.", 404);
  throw new ApiValidationError("Only draft invoices can be voided.", 409);
}

async function nextInvoiceNumber(organizationId: string, tx?: Parameters<typeof countInvoicesForOrganization>[1]): Promise<string> {
  const count = await countInvoicesForOrganization(organizationId, tx);
  const year = new Date().getFullYear();
  return `FTR-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Phase 7 — Invoice'ın kendi gerçek line/item authority'si, Order/Delivery
 * provenance'ı taşıyarak. createOrderFromQuote/createDeliveryFromOrder'ın
 * aynı "createXFromY" deseni: lines Order'ın KENDİ OrderItem satırlarından
 * (unitPriceCents/discountBasisPoints/vatRateBasisPoints) türetilir — Quote
 * asla yeniden okunmaz (Order Phase 6'dan beri Quote'tan bağımsızdır).
 *
 * Over-invoicing ceiling'i Phase 6'nın overshipping ceiling'iyle birebir
 * aynı mimari: her OrderItem satırı için FOR UPDATE ile kilitlenir (id
 * sıralı, deadlock'suz), sonra remaining = toplam DISPATCHED miktar (bkz.
 * sumDeliveredQuantityForOrderItem, delivery.repository.ts) eksi toplam
 * CANCELLED-olmayan faturalanmış miktar. Bu, ikinci bir "shippable
 * quantity" implementasyonu değil — bir sonraki lifecycle sınırı
 * (Delivery → Invoice) için AYNI desenin uygulanmasıdır.
 *
 * Totaller sunucu tarafında lines'tan deterministik hesaplanır
 * (computeLineTotalCents/computeQuoteTotalCents — Quote'un totals
 * authority'si, saf fonksiyonlar, reuse edilir). amount/taxAmount
 * totalAmount'ın kalan/net parçalarına bölünür (asla bağımsız
 * yuvarlanmaz) — recordInvoiceSent'in assertBalancedAmounts'ı
 * amount+taxAmount===totalAmount'ı tam olarak gerektirir.
 *
 * Bilinçli olarak Order.paymentTermSnapshot bu invoice'a KOPYALANMAZ: o
 * terim Order'ın TAM tutarına göre hesaplanmış olabilir (özellikle
 * FIXED_AMOUNT bileşenleri), ama bu invoice yalnız kısmi bir sevkiyatı
 * kapsıyor olabilir — mismatch riski. materializeReceivableSchedule zaten
 * paymentTermSnapshot'sız invoice'lar için trivialTermFromDueDate'e
 * (Phase 5) güvenli şekilde düşer; burada da aynı, zaten var olan yol
 * kullanılır.
 */
export async function createInvoiceFromOrder(input: CreateInvoiceFromOrderInput): Promise<InvoiceResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.sourceOrderId, "sourceOrderId");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.sourceOrderId, organizationId: input.organizationId },
      include: { items: true },
    });
    if (!order) throw new ApiValidationError("Order not found.", 404);
    if (!order.customerId) throw new ApiValidationError("Order has no customer; an invoice requires a known debtor.", 409);

    // A delivery-scoped invoice (sourceDeliveryId given, items omitted)
    // defaults to exactly what THAT delivery dispatched — never the order's
    // full ordered quantity. Using the order's own quantities here would
    // silently let a "invoice just this delivery" call request far more
    // than this delivery actually shipped; the per-item ceiling below would
    // likely still catch it (bounded by total dispatched across ALL
    // deliveries), but only by accident, not because the request was
    // correctly scoped to this one delivery's real quantities.
    let defaultItems = order.items.map((item) => ({ orderItemId: item.id, quantity: Number(item.quantity) }));
    if (input.sourceDeliveryId) {
      const delivery = await tx.delivery.findFirst({
        where: { id: input.sourceDeliveryId, organizationId: input.organizationId, sourceOrderId: input.sourceOrderId },
        include: { items: true },
      });
      if (!delivery) throw new ApiValidationError("Delivery not found for this order.", 404);

      const quantityByOrderItemId = new Map<string, number>();
      for (const deliveryItem of delivery.items) {
        quantityByOrderItemId.set(deliveryItem.orderItemId, (quantityByOrderItemId.get(deliveryItem.orderItemId) ?? 0) + Number(deliveryItem.quantity));
      }
      defaultItems = [...quantityByOrderItemId.entries()].map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    }

    const requestedItems = input.items ?? defaultItems;
    if (!requestedItems.length) throw new ApiValidationError("No items to invoice.", 400);

    // Same FOR UPDATE + ORDER BY id pattern as Phase 6's overshipping guard:
    // locks every referenced OrderItem row before reading dispatched/invoiced
    // sums below, so two concurrent createInvoiceFromOrder calls for the
    // same OrderItem cannot both read the same pre-race sum and both pass.
    const orderItemIds = [...new Set(requestedItems.map((r) => r.orderItemId))];
    await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ANY(${orderItemIds}) AND "organizationId" = ${input.organizationId} ORDER BY id FOR UPDATE`;

    const lineInputs = await Promise.all(
      requestedItems.map(async (req) => {
        const orderItem = order.items.find((i) => i.id === req.orderItemId);
        if (!orderItem) throw new ApiValidationError(`OrderItem ${req.orderItemId} does not belong to this order.`, 400);

        const dispatchedRows = await sumDeliveredQuantityForOrderItem(req.orderItemId, input.organizationId, null, tx);
        const totalDispatched = dispatchedRows.reduce((sum, r) => sum + Number(r.quantity), 0);
        const invoicedRows = await findInvoicedQuantityRowsForOrderItem(req.orderItemId, input.organizationId, tx);
        const totalInvoiced = invoicedRows.reduce((sum, r) => sum + Number(r.quantity), 0);
        const remaining = totalDispatched - totalInvoiced;
        if (req.quantity > remaining) {
          throw new ApiValidationError(
            `Faturalanan miktar sevk edilen miktarı aşıyor: ${orderItem.name} (sevk edilen: ${totalDispatched}, zaten faturalanmış: ${totalInvoiced}, istenen: ${req.quantity}).`,
            409,
          );
        }

        return {
          orderItemId: req.orderItemId,
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
    const totalAmountCents = computeQuoteTotalCents(lineTotalsCents, order.generalDiscountBasisPoints ?? null);
    const amountCents = sumLineTotalCents === BigInt(0) ? BigInt(0) : (totalAmountCents * sumNetCents) / sumLineTotalCents;
    const taxAmountCents = totalAmountCents - amountCents;

    const amount = centsToAmount(amountCents);
    const taxAmount = centsToAmount(taxAmountCents);
    const totalAmount = centsToAmount(totalAmountCents);
    const taxRate = amountCents === BigInt(0) ? 0 : roundMoney((Number(taxAmountCents) / Number(amountCents)) * 100);

    const invoiceNumber = await nextInvoiceNumber(input.organizationId, tx);
    const invoice = await createInvoice(
      {
        organizationId: input.organizationId,
        customerId: order.customerId,
        quoteId: null,
        orderId: order.id,
        deliveryId: input.sourceDeliveryId ?? null,
        invoiceNumber,
        title: `${order.orderNumber} için fatura`,
        amount,
        taxRate,
        taxAmount,
        totalAmount,
        currency: order.currency,
        dueDate: input.dueDate,
        notes: input.notes,
      },
      tx,
    );

    await createInvoiceItems(
      invoice.id,
      input.organizationId,
      lineInputs.map((line, index) => ({ ...line, lineTotalCents: lineTotalsCents[index]! })),
      tx,
    );

    return invoice;
  });
}

/**
 * P2002 (organizationId, idempotencyKey) çakışmasından sonra çağrılır. Bu
 * isteğin daha önce işlenmiş bir tekrarı mı, yoksa aynı key'in farklı bir
 * payload ile yeniden kullanımı mı olduğunu ayırt eder. Yeni bir Invoice
 * üretmez.
 */
async function resolveIdempotentReplay(
  organizationId: string,
  idempotencyKey: string,
  requestHash: string | null,
): Promise<CreateInvoiceOutcome> {
  const existing = await findInvoiceByIdempotencyKey(organizationId, idempotencyKey);
  if (!existing) {
    throw new ApiValidationError(
      "Idempotency key conflict detected but the original record could not be found.",
      500,
    );
  }

  if (existing.requestHash !== requestHash) {
    throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);
  }

  return { created: false, invoice: existing };
}

function normalizeCurrency(currency: string | undefined): string {
  const trimmed = currency?.trim().toUpperCase();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CURRENCY;
}

/**
 * quoteId verilmediyse Invoice.quoteId null kalır. Verildiyse: aynı
 * organization'a ve aynı Customer'a ait olmalı — aksi hâlde reddedilir.
 */
async function resolveValidatedQuoteId(
  organizationId: string,
  customerId: string,
  quoteId: string | undefined,
): Promise<string | null> {
  if (!quoteId) return null;

  const quote = await findQuoteByIdForOrganization(quoteId, organizationId);
  if (!quote) {
    throw new ApiValidationError("Quote not found.", 404);
  }

  if (quote.customerId !== customerId) {
    throw new ApiValidationError("Quote belongs to a different customer.", 409);
  }

  return quoteId;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new ApiValidationError(`${fieldName} is required.`);
  }
}

function assertValidAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError("amount must be a positive number.");
  }
}

function assertValidTaxRate(taxRate: number): void {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new ApiValidationError("taxRate must be between 0 and 100.");
  }
}
