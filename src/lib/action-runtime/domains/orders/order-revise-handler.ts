import { recordOrderRevision } from "@/lib/core/orders/order-intelligence.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const CHANGE_TYPES = ["QUANTITY_CHANGED", "DEADLINE_CHANGED"] as const;
type ChangeType = (typeof CHANGE_TYPES)[number];

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
 * order.revise — wraps recordOrderRevision, the same canonical service
 * PATCH /api/orders/[orderId] (action: "revise") already called. Only
 * QUANTITY_CHANGED/DEADLINE_CHANGED are exposed here (ITEM_REMOVED is a
 * real route capability order-management-conversation-extension.ts never
 * exposed either — not invented here, kept excluded to match exactly what
 * existed).
 */
export async function handleOrderRevise(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const orderId = requiredString(envelope.input.orderId, "orderId");
  const changeType = requiredEnum<ChangeType>(envelope.input.changeType, "changeType", CHANGE_TYPES);
  const reason = optionalString(envelope.input.reason);
  const organizationId = envelope.executionContext.organizationId;

  const change = changeType === "QUANTITY_CHANGED"
    ? { changeType: "QUANTITY_CHANGED" as const, orderItemId: requiredString(envelope.input.orderItemId, "orderItemId"), quantity: requiredNumber(envelope.input.quantity, "quantity") }
    : { changeType: "DEADLINE_CHANGED" as const, deadlineAt: envelope.input.deadlineAt === null ? null : new Date(requiredString(envelope.input.deadlineAt, "deadlineAt")) };

  const revision = await recordOrderRevision(orderId, organizationId, change, reason, envelope.executionContext.actorId);

  return {
    status: "SUCCESS",
    entityRef: { entityType: "order", entityId: orderId },
    resultSummary: `order.revise applied (${changeType}).`,
    metadata: { orderId, revisionId: revision.id, changeType },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredNumber(value: unknown, field: string): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) throw new Error(`${field} must be a number.`);
  return num;
}
