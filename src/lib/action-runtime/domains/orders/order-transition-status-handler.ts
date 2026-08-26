import { getOrderByIdForOrganization, transitionOrderStatus } from "@/lib/core/orders/order.service";
import type { OrderStatus } from "@/lib/core/orders/order.types";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const ORDER_STATUSES: readonly OrderStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PLANNED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "COMPLETED", "CANCELLED", "ON_HOLD"];
const AUTO_COMPENSATION_REASON = "Orkestrasyon adımı başarısız oldu; bu durum değişikliği otomatik olarak geri alındı.";

export async function handleOrderTransitionStatus(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const orderId = requiredString(envelope.input.orderId, "orderId");
  const toStatus = requiredEnum(envelope.input.toStatus, "toStatus", ORDER_STATUSES);
  const reason = optionalString(envelope.input.reason);

  // No version-guard/optimistic-concurrency exists on
  // transitionOrderStatus — read-before-write added here purely to capture
  // the pre-transition status for compensation.
  const previous = await getOrderByIdForOrganization(orderId, envelope.executionContext.organizationId);
  if (!previous) throw new Error("Order not found.");
  const fromStatus = previous.status;

  // CRITICAL side effect — its failure is the handler's failure.
  const order = await transitionOrderStatus({
    orderId,
    organizationId: envelope.executionContext.organizationId,
    toStatus,
    reason,
  });
  if (!order) throw new Error("Order status transition did not return a record.");

  return {
    status: "SUCCESS",
    entityRef: { entityType: "order", entityId: order.id },
    resultSummary: `Order transitioned to ${toStatus}.`,
    metadata: { orderId: order.id, toStatus },
    domainEvents: [],
    sideEffects: [],
    // Reversing this is itself an order.transitionStatus call back to the
    // pre-transition status. If the order's own state machine
    // (ALLOWED_TRANSITIONS in order.service.ts) doesn't permit going back
    // (e.g. SHIPPED → an earlier stage), the replay legitimately fails and
    // surfaces as COMPENSATION_FAILED — not silently absorbed.
    compensationSnapshot: fromStatus === toStatus ? undefined : { orderId, toStatus: fromStatus, reason: AUTO_COMPENSATION_REASON },
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
