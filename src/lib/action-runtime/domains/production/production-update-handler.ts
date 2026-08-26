import { getProductionOrderByIdForOrganization, updateProductionOrderDetails } from "@/lib/core/production/production.service";
import type { ProductionOrderStatus } from "@prisma/client";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const PRODUCTION_ORDER_STATUSES: readonly ProductionOrderStatus[] = ["DRAFT", "PLANNED", "RELEASED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"];
const REVERSIBLE_PRODUCTION_FIELDS = ["status", "quantityPlanned", "quantityProduced", "plannedStartAt", "plannedEndAt", "actualStartAt", "actualEndAt", "notes", "workCenterId"] as const;

export async function handleProductionUpdate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const productionOrderId = requiredString(envelope.input.productionOrderId, "productionOrderId");
  const status = optionalEnum(envelope.input.status, "status", PRODUCTION_ORDER_STATUSES);
  const quantityPlanned = optionalNumber(envelope.input.quantityPlanned, "quantityPlanned");
  const quantityProduced = optionalNumber(envelope.input.quantityProduced, "quantityProduced");

  // No version-guard/optimistic-concurrency exists on
  // updateProductionOrderDetails — read-before-write added here purely to
  // capture a "before" snapshot for compensation.
  const previous = await getProductionOrderByIdForOrganization(productionOrderId, envelope.executionContext.organizationId);
  if (!previous) throw new Error("Production order not found.");

  // CRITICAL side effect — its failure is the handler's failure.
  const order = await updateProductionOrderDetails({
    id: productionOrderId,
    organizationId: envelope.executionContext.organizationId,
    status,
    quantityPlanned,
    quantityProduced,
    plannedStartAt: optionalString(envelope.input.plannedStartAt),
    plannedEndAt: optionalString(envelope.input.plannedEndAt),
    actualStartAt: optionalString(envelope.input.actualStartAt),
    actualEndAt: optionalString(envelope.input.actualEndAt),
    notes: optionalString(envelope.input.notes),
    workCenterId: optionalString(envelope.input.workCenterId),
    statusChangeReason: optionalString(envelope.input.statusChangeReason),
  });
  if (!order) throw new Error("Production order update did not return a record.");

  const changedFields = REVERSIBLE_PRODUCTION_FIELDS.filter((field) => envelope.input[field] !== undefined);

  return {
    status: "SUCCESS",
    entityRef: { entityType: "production_order", entityId: order.id },
    resultSummary: "Production order updated.",
    metadata: { productionOrderId: order.id },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: buildCompensationSnapshot(productionOrderId, changedFields, previous as unknown as Record<string, unknown>),
  };
}

function buildCompensationSnapshot(productionOrderId: string, changedFields: readonly string[], previous: Record<string, unknown>): Record<string, unknown> | undefined {
  const reversePatch: Record<string, unknown> = {};
  for (const field of REVERSIBLE_PRODUCTION_FIELDS) {
    if (!changedFields.includes(field)) continue;
    const value = previous[field];
    reversePatch[field] = value instanceof Date ? value.toISOString()
      : (value && typeof value === "object" && "toNumber" in value ? (value as { toNumber(): number }).toNumber()
      : (value ?? null));
  }
  if (Object.keys(reversePatch).length === 0) return undefined;
  // A reverted status is a real, system-attributed status change, not a
  // user-issued one — reason recorded for the resulting status-history row.
  if ("status" in reversePatch) reversePatch.statusChangeReason = "Orkestrasyon adımı başarısız oldu; bu değişiklik otomatik olarak geri alındı.";
  return { productionOrderId, ...reversePatch };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number.`);
  return value;
}
function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${field} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}
