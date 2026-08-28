import { cancelOrder } from "@/lib/core/orders/order.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleOrderCancel(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const orderId = requiredString(envelope.input.orderId, "orderId");
  const reason = requiredString(envelope.input.reason, "reason");

  // CRITICAL side effect — its failure is the handler's failure.
  const order = await cancelOrder({
    orderId,
    organizationId: envelope.executionContext.organizationId,
    reason,
  });
  if (!order) throw new Error("Order cancellation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "order.cancelled", title: "Sipariş iptal edildi", body: `${order.orderNumber} — ${reason}`, entityType: "Order", entityId: order.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "order", entityId: order.id },
    resultSummary: "Order cancelled.",
    metadata: { orderId: order.id },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
