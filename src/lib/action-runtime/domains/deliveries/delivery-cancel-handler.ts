import { cancelDelivery } from "@/lib/core/deliveries/delivery.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleDeliveryCancel(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const deliveryId = requiredString(envelope.input.deliveryId, "deliveryId");
  const reason = requiredString(envelope.input.reason, "reason");

  const delivery = await cancelDelivery({
    deliveryId,
    organizationId: envelope.executionContext.organizationId,
    reason,
    performedById: envelope.executionContext.actorId,
  });
  if (!delivery) throw new Error("Delivery cancellation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "delivery.cancelled", title: "Teslimat iptal edildi", body: reason, entityType: "Delivery", entityId: deliveryId });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "delivery", entityId: deliveryId },
    resultSummary: "delivery.cancel completed.",
    metadata: { deliveryId },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
