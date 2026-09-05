import { createDeliveryFromOrder } from "@/lib/core/deliveries/delivery.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

/**
 * delivery.createFromOrder — wraps createDeliveryFromOrder
 * (delivery.service.ts), a distinct, more convenient capability from plain
 * delivery.create: it auto-derives the customer AND all shippable line
 * items from the source order itself (delivery.create instead requires an
 * explicit customerId and an empty item list), and optionally auto-
 * dispatches. Same canonical service POST /api/deliveries/from-order
 * already called — no reimplementation of the order-shippability checks
 * (SHIPPABLE_ORDER_STATUSES) or item derivation.
 */
export async function handleDeliveryCreateFromOrder(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const sourceOrderId = requiredString(envelope.input.sourceOrderId, "sourceOrderId");
  const autoDispatch = envelope.input.autoDispatch === true;
  const organizationId = envelope.executionContext.organizationId;

  const delivery = await createDeliveryFromOrder({ organizationId, sourceOrderId, autoDispatch });
  if (!delivery) throw new Error("Delivery creation from order did not return a record.");

  await notifyWithOwnerFanout({
    organizationId, actorUserId: envelope.executionContext.actorId, type: "delivery.created",
    title: "Yeni teslimat oluşturuldu", body: `İrsaliye ${delivery.deliveryNumber}`,
    entityType: "Delivery", entityId: delivery.id,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "delivery", entityId: delivery.id },
    resultSummary: `delivery.createFromOrder created ${delivery.deliveryNumber}.`,
    metadata: { deliveryId: delivery.id, sourceOrderId, autoDispatch },
    domainEvents: [],
    sideEffects: [],
  };
}
