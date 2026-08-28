import { createNewOrder } from "@/lib/core/orders/order.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleOrderCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const customerId = requiredString(envelope.input.customerId, "customerId");
  const currency = optionalString(envelope.input.currency);
  const notes = optionalString(envelope.input.notes);
  const deadlineAtInput = envelope.input.deadlineAt;
  if (deadlineAtInput !== undefined && typeof deadlineAtInput !== "string") throw new Error("deadlineAt must be a string.");
  const deadlineAt = deadlineAtInput ? new Date(deadlineAtInput) : undefined;
  if (deadlineAt && Number.isNaN(deadlineAt.getTime())) throw new Error("deadlineAt must be a valid date.");

  // CRITICAL side effect — its failure is the handler's failure.
  const order = await createNewOrder({
    organizationId: envelope.executionContext.organizationId,
    customerId,
    currency,
    notes,
    deadlineAt,
  });
  if (!order) throw new Error("Order creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "order.created", title: "Yeni sipariş oluşturuldu", body: order.orderNumber, entityType: "Order", entityId: order.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "order", entityId: order.id },
    resultSummary: "Canonical order created.",
    metadata: { orderId: order.id },
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
