import { createNewSupplier } from "@/lib/core/suppliers/supplier.service";
import { findSupplierByIdentity } from "@/lib/core/suppliers/supplier.repository";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handleSupplierCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const displayName = requiredString(envelope.input.displayName, "displayName");
  const taxNumber = optionalString(envelope.input.taxNumber);
  const existing = await findSupplierByIdentity(envelope.executionContext.organizationId, displayName, taxNumber);
  const supplier = existing ?? await createNewSupplier({
    organizationId: envelope.executionContext.organizationId,
    displayName,
    legalName: optionalString(envelope.input.legalName),
    phone: optionalString(envelope.input.phone),
    email: optionalString(envelope.input.email),
    website: optionalString(envelope.input.website),
    taxNumber,
    taxOffice: optionalString(envelope.input.taxOffice),
    currency: optionalString(envelope.input.currency),
  });
  if (!supplier) throw new Error("Supplier creation did not return a record.");
  if (!existing) {
    await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "supplier.created", title: "Yeni tedarikçi kaydı açıldı", body: supplier.displayName, entityType: "Supplier", entityId: supplier.id });
  }
  return {
    status: "SUCCESS",
    entityRef: { entityType: "supplier", entityId: supplier.id },
    resultSummary: existing ? "Canonical supplier already existed." : "Canonical supplier created.",
    metadata: { duplicate: Boolean(existing) },
    domainEvents: [],
    sideEffects: [],
    resultOutcome: existing ? "NO_CHANGE" : undefined,
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
