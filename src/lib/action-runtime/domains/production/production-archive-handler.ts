import { archiveProductionOrderById } from "@/lib/core/production/production.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleProductionArchive(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productionOrderId = requiredString(envelope.input.productionOrderId, "productionOrderId");

  // CRITICAL side effect — its failure is the handler's failure.
  await archiveProductionOrderById(productionOrderId, envelope.executionContext.organizationId);

  return {
    status: "SUCCESS",
    entityRef: { entityType: "production_order", entityId: productionOrderId },
    resultSummary: "Production order archived.",
    metadata: { productionOrderId },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
