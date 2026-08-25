import { archiveSupplierById } from "@/lib/core/suppliers/supplier.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleSupplierArchive(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const supplierId = requiredString(envelope.input.supplierId, "supplierId");

  // CRITICAL side effect — its failure is the handler's failure.
  await archiveSupplierById(supplierId, envelope.executionContext.organizationId);

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
