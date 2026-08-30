import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import type { DeliveryStatus, Prisma } from "@prisma/client";
import {
  createDelivery,
  createDeliveryItems,
  DeliveryConcurrentlyModifiedError,
  generateDeliveryNumber,
  getDeliveryById,
  listDeliveriesForOrganization,
  recordDeliveryStatusTransition,
  updateDeliveryStatus,
} from "./delivery.repository";
import { transitionOrderStatus } from "@/lib/core/orders/order.service";
import { consumeStockForDelivery } from "@/lib/core/stock/stock.service";
import { refreshDeliveryIntelligence } from "./delivery-intelligence.service";
import type {
  CancelDeliveryInput,
  CreateDeliveryFromOrderInput,
  CreateDeliveryInput,
  ListDeliveriesInput,
  TransitionDeliveryStatusInput,
} from "./delivery.types";

// §17 permitted transition graph — terminal states have empty sets
const ALLOWED_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  DRAFT: ["PREPARING", "CANCELLED"],
  PREPARING: ["PICKING", "CANCELLED"],
  PICKING: ["PACKING", "CANCELLED"],
  PACKING: ["LOADED", "CANCELLED"],
  LOADED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["AT_DELIVERY_POINT", "FAILED_DELIVERY"],
  AT_DELIVERY_POINT: ["DELIVERED", "FAILED_DELIVERY"],
  DELIVERED: ["COMPLETED"],
  FAILED_DELIVERY: ["RESCHEDULED"],
  RESCHEDULED: ["DISPATCHED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const SHIPPABLE_ORDER_STATUSES = ["READY", "PARTIALLY_SHIPPED"] as const;

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

/**
 * Canonical, single guard for "may these (orderItemId, quantity) pairs
 * become new DeliveryItem rows without exceeding each OrderItem's
 * deliverable ceiling" — the ONLY place this check is implemented.
 * createDeliveryFromOrder and createNewDelivery both call this rather than
 * each carrying their own copy, so the hard invariant ("Order'a bağlı
 * hiçbir Delivery creation path canonical OrderItem deliverable ceiling'ini
 * bypass edemez") holds regardless of which path a caller uses.
 *
 * Locks the exact OrderItem rows involved (FOR UPDATE, id-ordered) BEFORE
 * reading "already shipped" sums — under the default READ COMMITTED
 * isolation, an unlocked read-then-write ceiling check lets two concurrent
 * creation calls for the same OrderItem both read the same pre-race sum and
 * both pass (TOCTOU). Acquiring the lock first forces a second concurrent
 * call to block until the first's whole transaction commits, so its sum-read
 * is guaranteed to see the first call's committed DeliveryItem rows.
 * ORDER BY id fixes one global lock-acquisition order across calls that
 * target overlapping item sets (even across different orders), so two such
 * calls can never deadlock on each other.
 */
async function lockAndAssertShippableQuantities(
  tx: Prisma.TransactionClient,
  organizationId: string,
  orderItems: { id: string; quantity: Prisma.Decimal | number; name: string }[],
  requestedItems: { orderItemId: string; quantity: number }[],
): Promise<void> {
  if (!requestedItems.length) return;

  const orderItemIds = [...new Set(requestedItems.map((r) => r.orderItemId))];
  await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ANY(${orderItemIds}) AND "organizationId" = ${organizationId} ORDER BY id FOR UPDATE`;

  await Promise.all(
    requestedItems.map(async (req) => {
      const orderItem = orderItems.find((i) => i.id === req.orderItemId);
      if (!orderItem) throw new ApiValidationError(`OrderItem ${req.orderItemId} does not belong to this order.`);

      const existingRows = await tx.deliveryItem.findMany({
        where: {
          orderItemId: req.orderItemId,
          organizationId,
          delivery: { status: { in: ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED"] } },
        },
        select: { quantity: true },
      });
      const alreadyShipped = existingRows.reduce((sum, r) => sum + Number(r.quantity), 0);
      const orderQty = Number(orderItem.quantity);
      if (alreadyShipped + req.quantity > orderQty) {
        throw new ApiValidationError(
          `Sevk edilen miktar sipariş miktarını aşıyor: ${orderItem.name} (sipariş: ${orderQty}, zaten sevk edilmiş: ${alreadyShipped}, istenen: ${req.quantity}).`,
        );
      }
    }),
  );
}

export async function createNewDelivery(input: CreateDeliveryInput) {
  assert(input.organizationId, "organizationId");
  assert(input.sourceOrderId, "sourceOrderId");
  assert(input.customerId, "customerId");

  return prisma.$transaction(async (tx) => {
    // The two live callers (POST /api/deliveries, delivery.create action)
    // always pass items: [] today, so this branch is a no-op for current
    // production traffic — but CreateDeliveryInput's contract does allow a
    // caller to attach real OrderItem-linked items here, and this is an
    // Order-linked path (sourceOrderId is required), so it must be guarded
    // by the same canonical ceiling as createDeliveryFromOrder rather than
    // left open for whichever caller populates it first.
    if (input.items.length) {
      const order = await tx.order.findFirst({ where: { id: input.sourceOrderId, organizationId: input.organizationId }, include: { items: true } });
      if (!order) throw new ApiValidationError("Order not found.");
      if (!SHIPPABLE_ORDER_STATUSES.includes(order.status as typeof SHIPPABLE_ORDER_STATUSES[number])) {
        throw new ApiValidationError(`Order in status ${order.status} cannot be shipped. Order must be READY or PARTIALLY_SHIPPED.`);
      }
      await lockAndAssertShippableQuantities(
        tx,
        input.organizationId,
        order.items,
        input.items.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity })),
      );
    }

    const deliveryNumber = await generateDeliveryNumber(input.organizationId, tx);
    const delivery = await createDelivery({ ...input, deliveryNumber }, tx);
    if (input.items.length) {
      await createDeliveryItems(delivery.id, input.organizationId, input.items, tx);
    }
    await recordDeliveryStatusTransition(delivery.id, input.organizationId, null, "DRAFT", {}, tx);
    await refreshDeliveryIntelligence(delivery.id, input.organizationId, tx);
    return getDeliveryById(delivery.id, input.organizationId, tx);
  });
}

export async function createDeliveryFromOrder(input: CreateDeliveryFromOrderInput) {
  assert(input.organizationId, "organizationId");
  assert(input.sourceOrderId, "sourceOrderId");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.sourceOrderId, organizationId: input.organizationId },
      include: { items: true, customer: true },
    });
    if (!order) throw new ApiValidationError("Order not found.");
    if (!SHIPPABLE_ORDER_STATUSES.includes(order.status as typeof SHIPPABLE_ORDER_STATUSES[number])) {
      throw new ApiValidationError(`Order in status ${order.status} cannot be shipped. Order must be READY or PARTIALLY_SHIPPED.`);
    }

    const requestedItems = input.items ?? order.items.map((item) => ({ orderItemId: item.id, quantity: Number(item.quantity) }));
    if (!requestedItems.length) throw new ApiValidationError("No items to ship.");

    await lockAndAssertShippableQuantities(tx, input.organizationId, order.items, requestedItems);

    const deliveryItemInputs = requestedItems.map((req) => {
      const orderItem = order.items.find((i) => i.id === req.orderItemId)!;
      return {
        orderItemId: req.orderItemId,
        productServiceId: orderItem.productServiceId ?? undefined,
        name: orderItem.name,
        unit: orderItem.unit ?? undefined,
        quantity: req.quantity,
        sortOrder: orderItem.sortOrder,
      };
    });

    const deliveryNumber = await generateDeliveryNumber(input.organizationId, tx);
    const delivery = await createDelivery(
      {
        organizationId: input.organizationId,
        deliveryNumber,
        sourceOrderId: input.sourceOrderId,
        customerId: order.customerId,
        items: deliveryItemInputs,
      },
      tx,
    );
    await createDeliveryItems(delivery.id, input.organizationId, deliveryItemInputs, tx);
    await recordDeliveryStatusTransition(delivery.id, input.organizationId, null, "DRAFT", { performedById: input.performedById }, tx);

    if (input.autoDispatch) {
      const createdItems = await tx.deliveryItem.findMany({ where: { deliveryId: delivery.id }, select: { orderItemId: true, quantity: true } });
      await updateDeliveryStatus(delivery.id, input.organizationId, "DRAFT", "DISPATCHED", { dispatchedAt: new Date() }, tx);
      await recordDeliveryStatusTransition(delivery.id, input.organizationId, "DRAFT", "DISPATCHED", { performedById: input.performedById }, tx);
      await consumeStockForDelivery(delivery.id, input.organizationId, tx);
      await syncOrderShipmentStatus(input.sourceOrderId, input.organizationId, createdItems, tx);
    }

    await refreshDeliveryIntelligence(delivery.id, input.organizationId, tx);

    return getDeliveryById(delivery.id, input.organizationId, tx);
  });
}

export function listDeliveries(input: ListDeliveriesInput) {
  assert(input.organizationId, "organizationId");
  return listDeliveriesForOrganization(input);
}

export function getDeliveryByIdForOrganization(id: string, organizationId: string) {
  assert(id, "id");
  assert(organizationId, "organizationId");
  return getDeliveryById(id, organizationId);
}

export async function transitionDeliveryStatus(input: TransitionDeliveryStatusInput, outerTx?: Prisma.TransactionClient) {
  assert(input.deliveryId, "deliveryId");
  assert(input.organizationId, "organizationId");

  const execute = async (tx: Prisma.TransactionClient) => {
    const delivery = await tx.delivery.findFirst({
      where: { id: input.deliveryId, organizationId: input.organizationId },
      include: { items: true },
    });
    if (!delivery) throw new ApiValidationError("Delivery not found.");

    const allowed = ALLOWED_TRANSITIONS[delivery.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiValidationError(`Transition from ${delivery.status} to ${input.toStatus} is not permitted.`);
    }

    const extra: { dispatchedAt?: Date; deliveredAt?: Date } = {};
    if (input.toStatus === "DISPATCHED") extra.dispatchedAt = new Date();
    if (input.toStatus === "DELIVERED") extra.deliveredAt = new Date();

    let result;
    try {
      result = await updateDeliveryStatus(input.deliveryId, input.organizationId, delivery.status, input.toStatus, extra, tx);
    } catch (error) {
      if (error instanceof DeliveryConcurrentlyModifiedError) {
        throw new ApiValidationError("Delivery status was changed concurrently by another request; reload and retry.", 409);
      }
      throw error;
    }
    if (!result.count) throw new ApiValidationError("Delivery not found.");

    await recordDeliveryStatusTransition(
      input.deliveryId,
      input.organizationId,
      delivery.status,
      input.toStatus,
      { reason: input.reason, performedById: input.performedById, evidence: input.evidence },
      tx,
    );

    // Order↔Delivery sync + Stock consumption: when dispatched, consume reserved stock and update order status
    if (input.toStatus === "DISPATCHED") {
      await consumeStockForDelivery(input.deliveryId, input.organizationId, tx);
      await syncOrderShipmentStatus(delivery.sourceOrderId, input.organizationId, delivery.items, tx);
    }

    await refreshDeliveryIntelligence(input.deliveryId, input.organizationId, tx);

    return getDeliveryById(input.deliveryId, input.organizationId, tx);
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

export async function cancelDelivery(input: CancelDeliveryInput, outerTx?: Prisma.TransactionClient) {
  assert(input.deliveryId, "deliveryId");
  assert(input.organizationId, "organizationId");
  assert(input.reason, "reason");

  const execute = async (tx: Prisma.TransactionClient) => {
    const delivery = await tx.delivery.findFirst({ where: { id: input.deliveryId, organizationId: input.organizationId } });
    if (!delivery) throw new ApiValidationError("Delivery not found.");

    const allowed = ALLOWED_TRANSITIONS[delivery.status];
    if (!allowed.includes("CANCELLED")) {
      throw new ApiValidationError(`Delivery in status ${delivery.status} cannot be cancelled.`);
    }

    try {
      await updateDeliveryStatus(input.deliveryId, input.organizationId, delivery.status, "CANCELLED", { cancellationReason: input.reason }, tx);
    } catch (error) {
      if (error instanceof DeliveryConcurrentlyModifiedError) {
        throw new ApiValidationError("Delivery status was changed concurrently by another request; reload and retry.", 409);
      }
      throw error;
    }
    await recordDeliveryStatusTransition(
      input.deliveryId,
      input.organizationId,
      delivery.status,
      "CANCELLED",
      { reason: input.reason, performedById: input.performedById },
      tx,
    );
    await refreshDeliveryIntelligence(input.deliveryId, input.organizationId, tx);

    return getDeliveryById(input.deliveryId, input.organizationId, tx);
  };
  return outerTx ? execute(outerTx) : prisma.$transaction(execute);
}

// §6/§18: sync Order status based on total dispatched quantities across all deliveries
async function syncOrderShipmentStatus(
  sourceOrderId: string,
  organizationId: string,
  dispatchedItems: { orderItemId: string; quantity: import("@prisma/client").Prisma.Decimal }[],
  tx: import("@prisma/client").Prisma.TransactionClient,
) {
  const order = await tx.order.findFirst({
    where: { id: sourceOrderId, organizationId },
    include: { items: true },
  });
  if (!order) return;
  if (!["READY", "PARTIALLY_SHIPPED"].includes(order.status)) return;

  // Gather total dispatched quantities per orderItem across all non-cancelled deliveries
  const dispatchedRows = await tx.deliveryItem.findMany({
    where: {
      organizationId,
      orderItem: { orderId: sourceOrderId },
      delivery: { status: { in: ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED"] } },
    },
    select: { orderItemId: true, quantity: true },
  });

  const shippedByItem = new Map<string, number>();
  for (const row of dispatchedRows) {
    shippedByItem.set(row.orderItemId, (shippedByItem.get(row.orderItemId) ?? 0) + Number(row.quantity));
  }

  const allFullyShipped = order.items.every((item) => {
    const shipped = shippedByItem.get(item.id) ?? 0;
    return shipped >= Number(item.quantity);
  });

  const anyShipped = dispatchedItems.length > 0;

  if (allFullyShipped) {
    // Silent skip if transition not allowed
    const allowedFromReady = ["PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED"];
    const allowedFromPartially = ["SHIPPED", "CANCELLED"];
    const allowed = order.status === "READY" ? allowedFromReady : allowedFromPartially;
    if (allowed.includes("SHIPPED")) {
      try {
        await transitionOrderStatus({ orderId: sourceOrderId, organizationId, toStatus: "SHIPPED" }, tx);
      } catch {
        // Already in terminal or non-allowed state — silently skip
      }
    }
  } else if (anyShipped && order.status === "READY") {
    try {
      await transitionOrderStatus({ orderId: sourceOrderId, organizationId, toStatus: "PARTIALLY_SHIPPED" }, tx);
    } catch {
      // Already PARTIALLY_SHIPPED or not allowed — silently skip
    }
  }
}
