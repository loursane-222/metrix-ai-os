import { createNewProductionOrder } from "@/lib/core/production/production.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleProductionCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const orderNumber = requiredString(envelope.input.orderNumber, "orderNumber");
  const quantityPlanned = envelope.input.quantityPlanned;
  if (typeof quantityPlanned !== "number" || !Number.isFinite(quantityPlanned) || quantityPlanned <= 0) throw new Error("quantityPlanned must be a positive number.");

  // CRITICAL side effect — its failure is the handler's failure.
  const order = await createNewProductionOrder({
    organizationId: envelope.executionContext.organizationId,
    orderNumber,
    quantityPlanned,
    productServiceId: optionalString(envelope.input.productServiceId),
    plannedStartAt: optionalString(envelope.input.plannedStartAt),
    plannedEndAt: optionalString(envelope.input.plannedEndAt),
    notes: optionalString(envelope.input.notes),
  });
  if (!order) throw new Error("Production order creation did not return a record.");

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "production_order.created", title: "Yeni üretim emri oluşturuldu", body: order.orderNumber, entityType: "ProductionOrder", entityId: order.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "production_order", entityId: order.id },
    resultSummary: "Canonical production order created.",
    metadata: { productionOrderId: order.id },
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
