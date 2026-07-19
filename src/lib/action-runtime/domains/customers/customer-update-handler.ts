import { updateCustomerWithVersionGuard } from "@/lib/core/customers/customer.service";

import { buildCustomerUpdatedDomainEvent } from "./customer-domain-events";
import { CustomerNotFoundError, CustomerUpdateInputError, CustomerVersionConflictError } from "./customer-update.errors";
import { validateCustomerUpdatePatch } from "./customer-update.types";
import type { CustomerUpdatePatch } from "./customer-update.types";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

function extractStructuralInput(
  input: Record<string, unknown>,
): { customerId: string; expectedVersion: string; patch: Record<string, unknown> } {
  const { customerId, expectedVersion, patch } = input;

  const reasons: string[] = [];
  if (typeof customerId !== "string" || customerId.trim().length === 0) {
    reasons.push("customerId is required.");
  }
  if (typeof expectedVersion !== "string" || expectedVersion.trim().length === 0) {
    reasons.push("expectedVersion is required.");
  }
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    reasons.push("patch must be an object.");
  }

  if (reasons.length > 0) {
    throw new CustomerUpdateInputError(reasons);
  }

  return {
    customerId: customerId as string,
    expectedVersion: expectedVersion as string,
    patch: patch as Record<string, unknown>,
  };
}

/**
 * customer.update için gerçek Domain Action handler'ı.
 *
 * Yalnızca mevcut Customer service'i çağırır — repository/Prisma'yı
 * doğrudan çağırmaz, başka handler çağırmaz, OutboxStore/AuditStore/
 * OperationStore'u doğrudan çağırmaz. Yalnızca HandlerResult döndürür;
 * Domain Event/side-effect enqueue Execution Runtime'ın sorumluluğudur.
 */
export const customerUpdateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { customerId, expectedVersion, patch: rawPatch } = extractStructuralInput(envelope.input);

  const patchErrors = validateCustomerUpdatePatch(rawPatch);
  if (patchErrors.length > 0) {
    throw new CustomerUpdateInputError(patchErrors);
  }

  const patch = rawPatch as CustomerUpdatePatch;
  const { commercialTerms, customFields, primaryContact, ...scalarPatch } = patch;
  const organizationId = envelope.executionContext.organizationId;
  const actorId = envelope.executionContext.actorId;

  const result = await updateCustomerWithVersionGuard({
    id: customerId,
    organizationId,
    expectedUpdatedAt: new Date(expectedVersion),
    updatedByUserId: actorId,
    ...scalarPatch,
    ...(commercialTerms ? { commercialTerms: normalizeCommercialTerms(commercialTerms) } : {}),
    ...(customFields ? { customFields: customFields.filter(isObject).map((item) => ({ definitionId: String(item.definitionId), value: item.value })) } : {}),
    ...(primaryContact ? { primaryContact: Object.fromEntries(Object.entries(primaryContact).filter((entry): entry is [string, string] => typeof entry[1] === "string")) } : {}),
  });

  if (result.outcome === "NOT_FOUND") {
    throw new CustomerNotFoundError(customerId);
  }

  if (result.outcome === "VERSION_CONFLICT") {
    throw new CustomerVersionConflictError(customerId);
  }

  const entityRef = { entityType: "customer", entityId: customerId };

  if (result.outcome === "NO_CHANGE") {
    return {
      status: "SUCCESS",
      entityRef,
      resultSummary: "No changes applied; patch matched the current customer values.",
      metadata: { changedFields: [], noChange: true },
      domainEvents: [],
      sideEffects: [],
      resultOutcome: "NO_CHANGE",
    };
  }

  const changedFields = Object.keys(patch);
  const newVersion = result.customer.updatedAt.toISOString();

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: `customer.update applied to ${changedFields.length} field(s).`,
    metadata: { changedFields },
    domainEvents: [
      buildCustomerUpdatedDomainEvent({
        customerId,
        changedFields,
        previousVersion: expectedVersion,
        newVersion,
        updatedByActorId: actorId,
      }),
    ],
    sideEffects: [],
  };
};
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function normalizeCommercialTerms(value: Record<string, unknown>) { return { ...(typeof value.paymentTermDays === "number" ? { paymentTermDays: value.paymentTermDays } : {}), ...(typeof value.creditLimitCents === "number" ? { creditLimitCents: BigInt(value.creditLimitCents) } : {}), ...(typeof value.defaultCurrency === "string" ? { defaultCurrency: value.defaultCurrency } : {}), ...(typeof value.discountRateBasisPoints === "number" ? { discountRateBasisPoints: value.discountRateBasisPoints } : {}), ...(typeof value.deliveryTerm === "string" ? { deliveryTerm: value.deliveryTerm } : {}), ...(typeof value.notes === "string" ? { notes: value.notes } : {}) }; }
