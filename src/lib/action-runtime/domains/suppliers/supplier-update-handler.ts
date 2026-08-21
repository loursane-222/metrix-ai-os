import { updateSupplierDetails } from "@/lib/core/suppliers/supplier.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleSupplierUpdate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const id = requiredString(envelope.input.id, "id");
  const patch = envelope.input.patch;
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw new Error("patch is required.");
  const fields = patch as Record<string, unknown>;
  await updateSupplierDetails({
    id,
    organizationId: envelope.executionContext.organizationId,
    displayName: optionalString(fields.displayName),
    legalName: optionalString(fields.legalName),
    phone: optionalString(fields.phone),
    email: optionalString(fields.email),
    website: optionalString(fields.website),
    taxNumber: optionalString(fields.taxNumber),
    taxOffice: optionalString(fields.taxOffice),
    currency: optionalString(fields.currency),
  });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "supplier", entityId: id },
    resultSummary: "Canonical supplier updated.",
    metadata: { supplierId: id, changedFields: Object.keys(fields) },
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
