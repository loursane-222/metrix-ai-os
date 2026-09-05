import { recordDeliveryException } from "@/lib/core/deliveries/delivery-intelligence.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const EXCEPTION_CATEGORIES = ["CUSTOMER_NOT_AT_ADDRESS", "DELIVERY_REFUSED", "PRODUCT_DAMAGED", "VEHICLE_BREAKDOWN", "WRONG_ADDRESS", "SHORTAGE_FOUND", "DELIVERY_POSTPONED", "OTHER"] as const;
type ExceptionCategory = (typeof EXCEPTION_CATEGORIES)[number];

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

/**
 * delivery.addException — wraps recordDeliveryException, the same
 * canonical service PATCH /api/deliveries/[deliveryId] (action:
 * "exception") already called. Not reversible: an exception record is an
 * additive log entry (customer not at address, product damaged, etc.),
 * not a state transition with a natural undo.
 */
export async function handleDeliveryAddException(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const deliveryId = requiredString(envelope.input.deliveryId, "deliveryId");
  const category = requiredEnum<ExceptionCategory>(envelope.input.category, "category", EXCEPTION_CATEGORIES);
  const note = optionalString(envelope.input.note);
  const organizationId = envelope.executionContext.organizationId;

  const exception = await recordDeliveryException(deliveryId, organizationId, category, note, envelope.executionContext.actorId);

  return {
    status: "SUCCESS",
    entityRef: { entityType: "delivery", entityId: deliveryId },
    resultSummary: `delivery.addException recorded (${category}).`,
    metadata: { deliveryId, exceptionId: exception.id, category },
    domainEvents: [],
    sideEffects: [],
  };
}
