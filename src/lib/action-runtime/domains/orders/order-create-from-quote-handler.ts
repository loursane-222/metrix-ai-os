import { createOrderFromQuote } from "@/lib/core/orders/order.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

/**
 * order.createFromQuote — wraps createOrderFromQuote (order.service.ts), a
 * distinct, more convenient capability from plain order.create: it
 * auto-derives the customer AND line items from the won quote itself
 * (order.create instead requires an explicit customerId with no items).
 * Same canonical service POST /api/orders/from-quote already called.
 */
export async function handleOrderCreateFromQuote(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const quoteId = requiredString(envelope.input.quoteId, "quoteId");
  const organizationId = envelope.executionContext.organizationId;

  const order = await createOrderFromQuote({ organizationId, quoteId, performedById: envelope.executionContext.actorId });
  if (!order) throw new Error("Order creation from quote did not return a record.");

  await notifyWithOwnerFanout({
    organizationId, actorUserId: envelope.executionContext.actorId, type: "order.created",
    title: "Yeni sipariş oluşturuldu", body: `Sipariş ${order.orderNumber}`,
    entityType: "Order", entityId: order.id,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "order", entityId: order.id },
    resultSummary: `order.createFromQuote created ${order.orderNumber}.`,
    metadata: { orderId: order.id, quoteId },
    domainEvents: [],
    sideEffects: [],
  };
}
