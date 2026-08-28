import { createNewDelivery } from "@/lib/core/deliveries/delivery.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleDeliveryCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const sourceOrderId = requiredString(envelope.input.sourceOrderId, "sourceOrderId");
  const customerId = requiredString(envelope.input.customerId, "customerId");
  const warehouse = optionalString(envelope.input.warehouse);
  const dispatchPoint = optionalString(envelope.input.dispatchPoint);
  const deliveryAddress = optionalString(envelope.input.deliveryAddress);
  const carrier = optionalString(envelope.input.carrier);
  const notes = optionalString(envelope.input.notes);

  // CRITICAL side effect — its failure is the handler's failure.
  const delivery = await createNewDelivery({
    organizationId: envelope.executionContext.organizationId,
    sourceOrderId,
    customerId,
    warehouse,
    dispatchPoint,
    deliveryAddress,
    carrier,
    notes,
    items: [],
  });
  if (!delivery) throw new Error("Delivery creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "delivery.created", title: "Yeni teslimat oluşturuldu", body: deliveryAddress, entityType: "Delivery", entityId: delivery.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "delivery", entityId: delivery.id },
    resultSummary: "Canonical delivery created.",
    metadata: { deliveryId: delivery.id },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
