import { recordPhysicalCount } from "@/lib/core/stock/stock-intelligence.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function requiredNumber(value: unknown, field: string): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) throw new Error(`${field} must be a number.`);
  return num;
}

/**
 * stock.recordCount — wraps recordPhysicalCount, the same canonical
 * service POST /api/stock/counts already called. A DIFFERENT, two-step
 * workflow from stock.adjustment (which applies immediately): this records
 * a physical count and, if it differs from the system quantity, creates a
 * PENDING variance record that stock.resolveVariance must separately
 * confirm or dismiss before it takes effect.
 */
export async function handleStockRecordCount(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const stockId = requiredString(envelope.input.stockId, "stockId");
  const countedQuantity = requiredNumber(envelope.input.countedQuantity, "countedQuantity");
  const note = optionalString(envelope.input.note);
  const organizationId = envelope.executionContext.organizationId;

  const record = await recordPhysicalCount(stockId, organizationId, countedQuantity, note, envelope.executionContext.actorId);

  return {
    status: "SUCCESS",
    entityRef: { entityType: "stock_count", entityId: record.id },
    resultSummary: "stock.recordCount applied.",
    metadata: { stockId, countRecordId: record.id, varianceQuantity: record.varianceQuantity },
    domainEvents: [],
    sideEffects: [],
  };
}
