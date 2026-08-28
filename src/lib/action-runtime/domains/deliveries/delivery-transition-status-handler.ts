import { getDeliveryByIdForOrganization, transitionDeliveryStatus } from "@/lib/core/deliveries/delivery.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const DELIVERY_STATUSES = [
  "DRAFT", "PREPARING", "PICKING", "PACKING", "LOADED", "DISPATCHED",
  "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED", "FAILED_DELIVERY", "RESCHEDULED", "CANCELLED",
] as const;
type DeliveryStatusValue = (typeof DELIVERY_STATUSES)[number];
const AUTO_COMPENSATION_REASON = "Orkestrasyon adımı başarısız oldu; bu durum değişikliği otomatik olarak geri alındı.";

// delivery.transitionStatus had a manifest entry but no handler — nothing
// could ever invoke it (same class of gap as collection.start). The
// underlying service already owns the real state machine
// (ALLOWED_TRANSITIONS) and side effects (stock consumption, order-shipment
// sync); this just wires it into Action Runtime, mirroring
// order-transition-status-handler.ts.
export async function handleDeliveryTransitionStatus(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const deliveryId = requiredString(envelope.input.deliveryId, "deliveryId");
  const toStatus = requiredEnum(envelope.input.toStatus, "toStatus", DELIVERY_STATUSES);
  const reason = optionalString(envelope.input.reason);
  const organizationId = envelope.executionContext.organizationId;

  // No version-guard/optimistic-concurrency exists on
  // transitionDeliveryStatus — read-before-write added here purely to
  // capture the pre-transition status for compensation.
  const previous = await getDeliveryByIdForOrganization(deliveryId, organizationId);
  if (!previous) throw new Error("Delivery not found.");
  const fromStatus = previous.status as DeliveryStatusValue;

  // CRITICAL side effect — its failure is the handler's failure.
  const delivery = await transitionDeliveryStatus({
    deliveryId,
    organizationId,
    toStatus,
    reason,
    performedById: envelope.executionContext.actorId,
  });
  if (!delivery) throw new Error("Delivery status transition did not return a record.");

  const entityRef = { entityType: "delivery", entityId: delivery.id };

  // NON-CRITICAL side effect — a failed delivery is exactly the kind of
  // proactive-notice case Madde 5 asked for (no one should have to think to
  // ask "any failed deliveries?"). Never allowed to fail the action; mirrors
  // the notify/audit pattern in task-create-handler.ts.
  let notificationDelivered = true;
  if (toStatus === "FAILED_DELIVERY") {
    try {
      await notifyWithOwnerFanout({
        organizationId,
        actorUserId: envelope.executionContext.actorId,
        type: "delivery.failed",
        title: "Teslimat başarısız oldu",
        body: `İrsaliye ${delivery.deliveryNumber} teslim edilemedi.`,
        severity: "WARNING",
        entityType: "Delivery",
        entityId: delivery.id,
      });
    } catch (cause) {
      notificationDelivered = false;
      await auditStore.append({
        recordType: "ACTION_RESULT",
        actionName: "delivery.transitionStatus.notify",
        actorId: envelope.executionContext.actorId,
        organizationId,
        entityRef,
        outcome: "FAILED",
        reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
        resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
        metadata: { deliveryId: delivery.id, critical: false },
      });
    }
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: `Delivery transitioned to ${toStatus}.`,
    metadata: { deliveryId: delivery.id, toStatus, ...(toStatus === "FAILED_DELIVERY" ? { notificationDelivered } : {}) },
    domainEvents: [],
    sideEffects: [],
    // Reversing this is itself a delivery.transitionStatus call back to the
    // pre-transition status. If the delivery's own state machine doesn't
    // permit going back, the replay legitimately fails and surfaces as
    // COMPENSATION_FAILED — not silently absorbed. Side effects triggered by
    // the forward transition (e.g. stock consumption on DISPATCHED) are not
    // reversed by this alone — see the same caveat on order.transitionStatus.
    compensationSnapshot: fromStatus === toStatus ? undefined : { deliveryId, toStatus: fromStatus, reason: AUTO_COMPENSATION_REASON },
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
