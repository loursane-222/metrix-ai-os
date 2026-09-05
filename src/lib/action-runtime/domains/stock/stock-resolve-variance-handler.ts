import { resolveInventoryVariance } from "@/lib/core/stock/stock-intelligence.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

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
 * stock.resolveVariance — wraps resolveInventoryVariance, the same
 * canonical service POST /api/stock/counts/[countRecordId]/resolve already
 * called. CONFIRM applies the counted quantity as the new system quantity;
 * DISMISS discards the pending variance record, leaving stock unchanged.
 */
export async function handleStockResolveVariance(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const countRecordId = requiredString(envelope.input.countRecordId, "countRecordId");
  const resolution = requiredEnum(envelope.input.resolution, "resolution", ["CONFIRM", "DISMISS"] as const);
  const note = optionalString(envelope.input.note);
  const organizationId = envelope.executionContext.organizationId;

  const record = await resolveInventoryVariance(countRecordId, organizationId, resolution, note, envelope.executionContext.actorId);

  return {
    status: "SUCCESS",
    entityRef: { entityType: "stock_count", entityId: countRecordId },
    resultSummary: `stock.resolveVariance applied (${resolution}).`,
    metadata: { countRecordId, resolution, record },
    domainEvents: [],
    sideEffects: [],
  };
}
