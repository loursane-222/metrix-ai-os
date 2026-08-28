import { getSupplierByIdForOrganization, updateSupplierDetails } from "@/lib/core/suppliers/supplier.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const REVERSIBLE_SUPPLIER_FIELDS = ["displayName", "legalName", "phone", "email", "website", "taxNumber", "taxOffice", "currency"] as const;

export async function handleSupplierUpdate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const id = requiredString(envelope.input.id, "id");
  const patch = envelope.input.patch;
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw new Error("patch is required.");
  const fields = patch as Record<string, unknown>;
  const organizationId = envelope.executionContext.organizationId;

  // No version-guard/optimistic-concurrency exists on updateSupplierDetails
  // (unlike customer.update/quote.update) — read-before-write added here
  // purely to capture a "before" snapshot for compensation.
  const previous = await getSupplierByIdForOrganization(id, organizationId);
  if (!previous) throw new Error("Supplier not found.");

  await updateSupplierDetails({
    id,
    organizationId,
    displayName: optionalString(fields.displayName),
    legalName: optionalString(fields.legalName),
    phone: optionalString(fields.phone),
    email: optionalString(fields.email),
    website: optionalString(fields.website),
    taxNumber: optionalString(fields.taxNumber),
    taxOffice: optionalString(fields.taxOffice),
    currency: optionalString(fields.currency),
  });
  const changedFields = Object.keys(fields);
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "supplier.updated", title: "Tedarikçi bilgileri güncellendi", body: (previous as { displayName?: string }).displayName, entityType: "Supplier", entityId: id });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "supplier", entityId: id },
    resultSummary: "Canonical supplier updated.",
    metadata: { supplierId: id, changedFields },
    domainEvents: [],
    sideEffects: [],
    compensationSnapshot: buildCompensationSnapshot(id, changedFields, previous as Record<string, unknown>),
  };
}

function buildCompensationSnapshot(id: string, changedFields: string[], previous: Record<string, unknown>): Record<string, unknown> | undefined {
  const reversePatch: Record<string, unknown> = {};
  for (const field of REVERSIBLE_SUPPLIER_FIELDS) {
    if (changedFields.includes(field)) reversePatch[field] = previous[field] ?? null;
  }
  if (Object.keys(reversePatch).length === 0) return undefined;
  return { id, patch: reversePatch };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
