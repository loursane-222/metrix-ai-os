import { transitionPurchaseOrderStatus } from "@/lib/core/purchase-orders/purchase-order.service";
import type { PurchaseOrderStatus } from "@/lib/core/purchase-orders/purchase-order.types";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

export async function handlePurchaseOrderTransitionStatus(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const purchaseOrderId = requiredString(envelope.input.purchaseOrderId, "purchaseOrderId");
  const toStatus = requiredEnum(envelope.input.toStatus, "toStatus", PURCHASE_ORDER_STATUSES);
  const reason = optionalString(envelope.input.reason);

  // CRITICAL side effect — its failure is the handler's failure.
  const purchaseOrder = await transitionPurchaseOrderStatus({ purchaseOrderId, organizationId: envelope.executionContext.organizationId, toStatus, reason });
  if (!purchaseOrder) throw new Error("PurchaseOrder status transition did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "purchaseOrder.statusChanged", title: "Satın alma siparişi durumu değişti", body: `${purchaseOrder.poNumber} → ${toStatus}`, entityType: "PurchaseOrder", entityId: purchaseOrder.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "purchase_order", entityId: purchaseOrder.id },
    resultSummary: `PurchaseOrder transitioned to ${toStatus}.`,
    metadata: { purchaseOrderId: purchaseOrder.id, toStatus },
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
function requiredEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${field} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}
