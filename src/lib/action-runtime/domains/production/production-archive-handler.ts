import { archiveProductionOrderById } from "@/lib/core/production/production.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleProductionArchive(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productionOrderId = requiredString(envelope.input.productionOrderId, "productionOrderId");
  const organizationId = envelope.executionContext.organizationId;

  // CRITICAL side effect — its failure is the handler's failure.
  await archiveProductionOrderById(productionOrderId, organizationId);

  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "production_order.archived", title: "Üretim emri arşivlendi", entityType: "ProductionOrder", entityId: productionOrderId });

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
