import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import type { OrderStatus, Prisma } from "@prisma/client";
import { releaseStockForOrder, reserveStockForOrder } from "@/lib/core/stock/stock.service";
import { refreshOrderIntelligence } from "./order-intelligence.service";
import {
  countOrdersForOrganization,
  createOrder,
  createOrderItems,
  generateOrderNumber,
  getOrderById,
  listOrdersForOrganization,
  OrderConcurrentlyModifiedError,
  recordStatusTransition,
  updateOrderStatus,
} from "./order.repository";
import type {
  CancelOrderInput,
  CreateOrderFromQuoteInput,
  CreateOrderInput,
  ListOrdersInput,
  TransitionOrderStatusInput,
} from "./order.types";
import { parseStructuredPaymentTerm, snapshotPaymentTermReferenceDates } from "@/lib/payment-terms";
import { toCents } from "@/lib/accounting/ledger.service";

// §17 permitted transition graph — terminal states have empty sets
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_PRODUCTION", "ON_HOLD", "CANCELLED"],
  IN_PRODUCTION: ["READY", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["PLANNED"],
  READY: ["PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED"],
  PARTIALLY_SHIPPED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

export async function createNewOrder(input: CreateOrderInput) {
  assert(input.organizationId, "organizationId");
  assert(input.customerId, "customerId");

  return prisma.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(input.organizationId, tx);
    const order = await createOrder({ ...input, orderNumber }, tx);
    if (input.items?.length) {
      await createOrderItems(order.id, input.organizationId, input.items, tx);
    }
    await recordStatusTransition(order.id, input.organizationId, null, "DRAFT", {}, tx);
    return getOrderById(order.id, input.organizationId, tx);
  });
}

export async function createOrderFromQuote(input: CreateOrderFromQuoteInput) {
  assert(input.organizationId, "organizationId");
  assert(input.quoteId, "quoteId");
  return prisma.$transaction((tx) => materializeConfirmedOrderFromQuote(input, tx));
}

export async function materializeConfirmedOrderFromQuote(input: CreateOrderFromQuoteInput, tx: Prisma.TransactionClient) {
    const quote = await tx.quote.findFirst({
      where: { id: input.quoteId, organizationId: input.organizationId },
      include: { items: true },
    });
    if (!quote) throw new ApiValidationError("Quote not found.");
    if (quote.status !== "WON") throw new ApiValidationError("Only WON quotes can be converted to orders.");

    const existing = await tx.order.findFirst({ where: { organizationId: input.organizationId, sourceQuoteId: input.quoteId } });
    if (existing) return getOrderById(existing.id, input.organizationId, tx);

    const orderNumber = await generateOrderNumber(input.organizationId, tx);
    const orderCreatedAt = new Date();
    const order = await tx.order.create({
      data: {
        organizationId: input.organizationId,
        orderNumber,
        customerId: quote.customerId ?? (() => { throw new ApiValidationError("Quote has no customer."); })(),
        sourceQuoteId: quote.id,
        confirmedAt: quote.wonAt,
        confirmedValueCents: quote.amount === null ? null : toCents(quote.amount),
        confirmationCurrency: quote.currency,
        currency: quote.currency,
        paymentTermSnapshot: quote.paymentTermStructured ? parseStructuredPaymentTerm(quote.paymentTermStructured) as unknown as Prisma.InputJsonValue : undefined,
        paymentTermReferenceDatesSnapshot: quote.paymentTermStructured ? snapshotPaymentTermReferenceDates(quote.createdAt, orderCreatedAt) as Prisma.InputJsonValue : undefined,
        generalDiscountBasisPoints: quote.generalDiscountBasisPoints ?? undefined,
        deliveryTerm: quote.deliveryTerm ?? undefined,
        deliveryMethod: quote.deliveryMethod ?? undefined,
        notes: quote.notes ?? undefined,
        status: "DRAFT",
        createdByUserId: input.performedById,
        createdAt: orderCreatedAt,
      },
    });

    if (quote.items.length) {
      await createOrderItems(
        order.id,
        input.organizationId,
        quote.items.map((item) => ({
          productServiceId: item.productServiceId ?? undefined,
          name: item.name,
          unit: item.unit ?? undefined,
          quantity: Number(item.quantity),
          unitPriceCents: item.unitPriceCents,
          discountBasisPoints: item.discountBasisPoints,
          vatRateBasisPoints: item.vatRateBasisPoints,
          lineTotalCents: item.lineTotalCents,
          sortOrder: item.sortOrder,
        })),
        tx,
      );
    }

    await recordStatusTransition(order.id, input.organizationId, null, "DRAFT", { performedById: input.performedById }, tx);
    return getOrderById(order.id, input.organizationId, tx);
}

export function listOrders(input: ListOrdersInput) {
  assert(input.organizationId, "organizationId");
  return listOrdersForOrganization(input);
}

export function countOrders(input: Pick<ListOrdersInput, "organizationId" | "status" | "customerId">) {
  assert(input.organizationId, "organizationId");
  return countOrdersForOrganization(input);
}

export function getOrderByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getOrderById(id, organizationId);
}

export async function transitionOrderStatus(input: TransitionOrderStatusInput, outerTx?: Prisma.TransactionClient) {
  assert(input.orderId, "orderId");
  assert(input.organizationId, "organizationId");

  const exec = async (tx: Prisma.TransactionClient) => {
    const order = await tx.order.findFirst({ where: { id: input.orderId, organizationId: input.organizationId } });
    if (!order) throw new ApiValidationError("Order not found.");

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiValidationError(`Transition from ${order.status} to ${input.toStatus} is not permitted.`);
    }

    let result;
    try {
      result = await updateOrderStatus(input.orderId, input.organizationId, order.status, input.toStatus, {}, tx);
    } catch (error) {
      if (error instanceof OrderConcurrentlyModifiedError) {
        throw new ApiValidationError("Order status was changed concurrently by another request; reload and retry.", 409);
      }
      throw error;
    }
    if (!result.count) throw new ApiValidationError("Order not found.");

    await recordStatusTransition(
      input.orderId,
      input.organizationId,
      order.status,
      input.toStatus,
      { reason: input.reason, performedById: input.performedById, evidence: input.evidence },
      tx,
    );

    if (input.toStatus === "APPROVED") {
      await reserveStockForOrder(input.orderId, input.organizationId, tx);
    }

    await refreshOrderIntelligence(input.orderId, input.organizationId, tx);

    return getOrderById(input.orderId, input.organizationId, tx);
  };

  return outerTx ? exec(outerTx) : prisma.$transaction(exec);
}

export async function cancelOrder(input: CancelOrderInput) {
  assert(input.orderId, "orderId");
  assert(input.organizationId, "organizationId");
  assert(input.reason, "reason");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: input.orderId, organizationId: input.organizationId } });
    if (!order) throw new ApiValidationError("Order not found.");

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes("CANCELLED")) {
      throw new ApiValidationError(`Order in status ${order.status} cannot be cancelled.`);
    }

    try {
      await updateOrderStatus(input.orderId, input.organizationId, order.status, "CANCELLED", { cancellationReason: input.reason }, tx);
    } catch (error) {
      if (error instanceof OrderConcurrentlyModifiedError) {
        throw new ApiValidationError("Order status was changed concurrently by another request; reload and retry.", 409);
      }
      throw error;
    }
    await recordStatusTransition(
      input.orderId,
      input.organizationId,
      order.status,
      "CANCELLED",
      { reason: input.reason, performedById: input.performedById },
      tx,
    );

    // §22 Stock Integrity: cancelling an order releases whatever portion of
    // its reservation has not already been consumed by a delivery — never
    // touches actual quantity (only reservedQuantity), keeping the
    // Delivery/Goods Receipt boundary as the sole authority over on-hand stock.
    await releaseStockForOrder(input.orderId, input.organizationId, tx);

    await refreshOrderIntelligence(input.orderId, input.organizationId, tx);

    return getOrderById(input.orderId, input.organizationId, tx);
  });
}
