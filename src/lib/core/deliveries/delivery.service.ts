import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import type { DeliveryStatus } from "@prisma/client";
import {
  createDelivery,
  createDeliveryItems,
  generateDeliveryNumber,
  getDeliveryById,
  listDeliveriesForOrganization,
  recordDeliveryStatusTransition,
  updateDeliveryStatus,
} from "./delivery.repository";
import { transitionOrderStatus } from "@/lib/core/orders/order.service";
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

export async function createNewDelivery(input: CreateDeliveryInput) {
  assert(input.organizationId, "organizationId");
  assert(input.sourceOrderId, "sourceOrderId");
  assert(input.customerId, "customerId");

  return prisma.$transaction(async (tx) => {
    const deliveryNumber = await generateDeliveryNumber(input.organizationId, tx);
    const delivery = await createDelivery({ ...input, deliveryNumber }, tx);
    if (input.items.length) {
      await createDeliveryItems(delivery.id, input.organizationId, input.items, tx);
    }
    await recordDeliveryStatusTransition(delivery.id, input.organizationId, null, "DRAFT", {}, tx);
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

    // Validate each item and check overshipping
    const deliveryItemInputs = await Promise.all(
      requestedItems.map(async (req) => {
        const orderItem = order.items.find((i) => i.id === req.orderItemId);
        if (!orderItem) throw new ApiValidationError(`OrderItem ${req.orderItemId} does not belong to this order.`);

        // Sum already-dispatched quantities for this orderItem (excluding current delivery)
        const existingRows = await tx.deliveryItem.findMany({
          where: {
            orderItemId: req.orderItemId,
            organizationId: input.organizationId,
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

        return {
          orderItemId: req.orderItemId,
          productServiceId: orderItem.productServiceId ?? undefined,
          name: orderItem.name,
          unit: orderItem.unit ?? undefined,
          quantity: req.quantity,
          sortOrder: orderItem.sortOrder,
        };
      }),
    );

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
      await updateDeliveryStatus(delivery.id, input.organizationId, "DISPATCHED", { dispatchedAt: new Date() }, tx);
      await recordDeliveryStatusTransition(delivery.id, input.organizationId, "DRAFT", "DISPATCHED", { performedById: input.performedById }, tx);
      await syncOrderShipmentStatus(input.sourceOrderId, input.organizationId, createdItems, tx);
    }

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

export async function transitionDeliveryStatus(input: TransitionDeliveryStatusInput) {
  assert(input.deliveryId, "deliveryId");
  assert(input.organizationId, "organizationId");

  return prisma.$transaction(async (tx) => {
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

    const result = await updateDeliveryStatus(input.deliveryId, input.organizationId, input.toStatus, extra, tx);
    if (!result.count) throw new ApiValidationError("Delivery not found.");

    await recordDeliveryStatusTransition(
      input.deliveryId,
      input.organizationId,
      delivery.status,
      input.toStatus,
      { reason: input.reason, performedById: input.performedById, evidence: input.evidence },
      tx,
    );

    // Order↔Delivery sync: when dispatched, update the order status
    if (input.toStatus === "DISPATCHED") {
      await syncOrderShipmentStatus(delivery.sourceOrderId, input.organizationId, delivery.items, tx);
    }

    return getDeliveryById(input.deliveryId, input.organizationId, tx);
  });
}

export async function cancelDelivery(input: CancelDeliveryInput) {
  assert(input.deliveryId, "deliveryId");
  assert(input.organizationId, "organizationId");
  assert(input.reason, "reason");

  return prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.findFirst({ where: { id: input.deliveryId, organizationId: input.organizationId } });
    if (!delivery) throw new ApiValidationError("Delivery not found.");

    const allowed = ALLOWED_TRANSITIONS[delivery.status];
    if (!allowed.includes("CANCELLED")) {
      throw new ApiValidationError(`Delivery in status ${delivery.status} cannot be cancelled.`);
    }

    await updateDeliveryStatus(input.deliveryId, input.organizationId, "CANCELLED", { cancellationReason: input.reason }, tx);
    await recordDeliveryStatusTransition(
      input.deliveryId,
      input.organizationId,
      delivery.status,
      "CANCELLED",
      { reason: input.reason, performedById: input.performedById },
      tx,
    );

    return getDeliveryById(input.deliveryId, input.organizationId, tx);
  });
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
