import { archiveSupplierById, getSupplierByIdForOrganization } from "@/lib/core/suppliers/supplier.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleSupplierArchive(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const supplierId = requiredString(envelope.input.supplierId, "supplierId");
  const organizationId = envelope.executionContext.organizationId;

  // CRITICAL side effect — its failure is the handler's failure.
  await archiveSupplierById(supplierId, organizationId);

  const archived = await getSupplierByIdForOrganization(supplierId, organizationId);
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "supplier.archived", title: "Tedarikçi pasife alındı", body: archived?.displayName, entityType: "Supplier", entityId: supplierId });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "supplier", entityId: supplierId },
    resultSummary: "Supplier archived.",
    metadata: { supplierId },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
