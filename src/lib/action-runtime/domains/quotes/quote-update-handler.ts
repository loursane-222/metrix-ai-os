import { updateQuoteWithVersionGuard } from "@/lib/core/quotes/quote.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";

import { buildQuoteUpdatedDomainEvent } from "./quote-domain-events";
import { QuoteNotFoundError, QuoteUpdateInputError, QuoteVersionConflictError } from "./quote-update.errors";
import { validateQuoteUpdatePatch } from "./quote-update.types";
import type { QuoteUpdatePatch } from "./quote-update.types";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";
import { parseStructuredPaymentTerm } from "@/lib/payment-terms";

function extractStructuralInput(
  input: Record<string, unknown>,
): { quoteId: string; expectedVersion: string; patch: Record<string, unknown> } {
  const { quoteId, expectedVersion, patch } = input;

  const reasons: string[] = [];
  if (typeof quoteId !== "string" || quoteId.trim().length === 0) {
    reasons.push("quoteId is required.");
  }
  if (typeof expectedVersion !== "string" || expectedVersion.trim().length === 0) {
    reasons.push("expectedVersion is required.");
  }
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    reasons.push("patch must be an object.");
  }

  if (reasons.length > 0) {
    throw new QuoteUpdateInputError(reasons);
  }

  return {
    quoteId: quoteId as string,
    expectedVersion: expectedVersion as string,
    patch: patch as Record<string, unknown>,
  };
}

/**
 * quote.update için gerçek Domain Action handler'ı — customerUpdateHandler ile
 * aynı sözleşme. Yalnızca mevcut Quote service'i çağırır, Prisma'yı doğrudan
 * çağırmaz, OutboxStore/AuditStore/OperationStore'u doğrudan çağırmaz.
 */
export const quoteUpdateHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { quoteId, expectedVersion, patch: rawPatch } = extractStructuralInput(envelope.input);

  const patchErrors = validateQuoteUpdatePatch(rawPatch);
  if (patchErrors.length > 0) {
    throw new QuoteUpdateInputError(patchErrors);
  }

  const patch = rawPatch as QuoteUpdatePatch;
  const organizationId = envelope.executionContext.organizationId;
  const actorId = envelope.executionContext.actorId;

  const result = await updateQuoteWithVersionGuard({
    id: quoteId,
    organizationId,
    expectedUpdatedAt: new Date(expectedVersion),
    ...(patch.items !== undefined ? { items: patch.items } : {}),
    ...(patch.generalDiscountBasisPoints !== undefined ? { generalDiscountBasisPoints: patch.generalDiscountBasisPoints } : {}),
    ...(patch.customerNote !== undefined ? { customerNote: patch.customerNote } : {}),
    ...(patch.specialTerms !== undefined ? { specialTerms: patch.specialTerms } : {}),
    ...(patch.validUntil !== undefined ? { validUntil: patch.validUntil === null ? null : new Date(patch.validUntil) } : {}),
    ...(patch.paymentTerm !== undefined ? { paymentTerm: patch.paymentTerm } : {}),
    ...(patch.paymentTermStructured !== undefined ? { paymentTermStructured: patch.paymentTermStructured === null ? null : parseStructuredPaymentTerm(patch.paymentTermStructured) } : {}),
    ...(patch.deliveryTerm !== undefined ? { deliveryTerm: patch.deliveryTerm } : {}),
    ...(patch.deliveryMethod !== undefined ? { deliveryMethod: patch.deliveryMethod } : {}),
  });

  if (result.outcome === "NOT_FOUND") {
    throw new QuoteNotFoundError(quoteId);
  }

  if (result.outcome === "VERSION_CONFLICT") {
    throw new QuoteVersionConflictError(quoteId);
  }

  const entityRef = { entityType: "quote", entityId: quoteId };

  if (result.outcome === "NO_CHANGE") {
    return {
      status: "SUCCESS",
      entityRef,
      resultSummary: "No changes applied; patch matched the current quote values.",
      metadata: { changedFields: [], noChange: true, resultingVersion: result.quote.updatedAt.toISOString() },
      domainEvents: [],
      sideEffects: [],
      resultOutcome: "NO_CHANGE",
    };
  }

  const changedFields = Object.keys(patch);
  const newVersion = result.quote.updatedAt.toISOString();

  await notifyWithOwnerFanout({ organizationId, actorUserId: actorId, type: "quote.updated", title: "Teklif güncellendi", body: result.quote.title, entityType: "Quote", entityId: quoteId });

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: `quote.update applied to ${changedFields.length} field(s).`,
    metadata: { changedFields, expectedVersion, resultingVersion: newVersion, verification: "Güncellenen teklif persistence katmanından doğrulandı" },
    domainEvents: [
      buildQuoteUpdatedDomainEvent({
        quoteId,
        changedFields,
        previousVersion: expectedVersion,
        newVersion,
        updatedByActorId: actorId,
      }),
    ],
    sideEffects: [],
    compensationSnapshot: buildCompensationSnapshot(quoteId, newVersion, patch, result.previous),
  };
};

// Reverse-patch of the commercial fields this update actually changed,
// restoring each to its pre-mutation value. `items` is deliberately NOT
// reverted — no cheap "before" snapshot of the full line-item array exists
// yet (same narrower-than-full scope as customer.update's
// commercialTerms/customFields/primaryContact). A patch touching only
// `items` ends up with an empty reverse-patch (no-op compensation).
const REVERSIBLE_QUOTE_FIELDS = [
  "generalDiscountBasisPoints", "customerNote", "specialTerms", "validUntil", "paymentTerm", "paymentTermStructured", "deliveryTerm", "deliveryMethod",
] as const;
function buildCompensationSnapshot(
  quoteId: string,
  expectedVersion: string,
  patch: QuoteUpdatePatch,
  previous: { [key: string]: unknown },
): Record<string, unknown> | undefined {
  const reversePatch: Record<string, unknown> = {};
  for (const field of REVERSIBLE_QUOTE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      const value = previous[field];
      reversePatch[field] = value instanceof Date ? value.toISOString() : (value ?? null);
    }
  }
  if (Object.keys(reversePatch).length === 0) return undefined;
  return { quoteId, expectedVersion, patch: reversePatch };
}
