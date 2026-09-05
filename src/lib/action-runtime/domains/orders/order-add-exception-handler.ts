import { recordOrderException } from "@/lib/core/orders/order-intelligence.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const EXCEPTION_CATEGORIES = ["CUSTOMER_HOLD_REQUEST", "PRODUCTION_STOPPED", "QUALITY_ISSUE", "SUPPLY_DELAY", "PAYMENT_HOLD", "SHIPMENT_DELAYED", "CUSTOMER_ADDRESS_CHANGED", "OTHER"] as const;
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
 * order.addException — wraps recordOrderException, the same canonical
 * service PATCH /api/orders/[orderId] (action: "exception") already
 * called.
 */
export async function handleOrderAddException(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const orderId = requiredString(envelope.input.orderId, "orderId");
  const category = requiredEnum<ExceptionCategory>(envelope.input.category, "category", EXCEPTION_CATEGORIES);
  const note = optionalString(envelope.input.note);
  const organizationId = envelope.executionContext.organizationId;

  const exception = await recordOrderException(orderId, organizationId, category, note, envelope.executionContext.actorId);

  return {
    status: "SUCCESS",
    entityRef: { entityType: "order", entityId: orderId },
    resultSummary: `order.addException recorded (${category}).`,
    metadata: { orderId, exceptionId: exception.id, category },
    domainEvents: [],
    sideEffects: [],
  };
}
