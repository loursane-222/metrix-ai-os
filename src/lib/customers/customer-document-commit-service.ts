import { Prisma } from "@prisma/client";
import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";
import { CUSTOMER_BUILT_IN_FIELDS } from "./customer-field-registry";
import { resolveCustomerAttachment } from "./customer-document-attachment.service";
import type { CreateCustomerBody, CustomerActionExecutionResult } from "./customers-client";

type Owner = { organizationId: string; actorId: string; attachmentRef: string };
type StoredExecution = CustomerActionExecutionResult & { entityRef?: { entityType: string; entityId: string }; metadata?: Record<string, unknown> };

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertReviewedValues(body: CreateCustomerBody, extractionPayload: unknown, reviewPayload: unknown): void {
  const extraction = extractionPayload as { candidates?: Array<{ fieldId?: unknown; normalizedValue?: unknown }>; duplicates?: Array<{ strength?: unknown }> } | null;
  const review = reviewPayload as { accepted?: unknown; edits?: unknown } | null;
  if (extraction?.duplicates?.some((item) => item.strength === "STRONG")) throw new ApiValidationError("Duplicate customer must be resolved through customer.update.");
  const accepted = Array.isArray(review?.accepted) ? review.accepted.filter((id): id is string => typeof id === "string") : [];
  const edits = review?.edits && typeof review.edits === "object" && !Array.isArray(review.edits) ? review.edits as Record<string, unknown> : {};
  const candidates = Array.isArray(extraction?.candidates) ? extraction.candidates : [];
  for (const fieldId of accepted) {
    const candidate = candidates.find((item) => item.fieldId === fieldId);
    if (!candidate) throw new ApiValidationError("Reviewed document candidate is unavailable.");
    const expected = Object.prototype.hasOwnProperty.call(edits, fieldId) ? edits[fieldId] : candidate.normalizedValue;
    if (fieldId.startsWith("customer.custom.")) {
      const definitionId = fieldId.slice("customer.custom.".length);
      const submitted = body.customFields?.find((item) => item.definitionId === definitionId)?.value;
      if (!sameValue(submitted, expected)) throw new ApiValidationError("Customer draft no longer matches the reviewed document fields.");
      continue;
    }
    const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === fieldId);
    if (!field || !sameValue((body as Record<string, unknown>)[field.key], expected)) throw new ApiValidationError("Customer draft no longer matches the reviewed document fields.");
  }
}

export async function claimReviewedCustomerDocument(input: Owner & { customer: CreateCustomerBody }) {
  const attachment = await resolveCustomerAttachment(input);
  if (attachment.committedCustomerId && attachment.commitResult) return { kind: "REPLAY" as const, execution: attachment.commitResult as unknown as StoredExecution, correlationId: attachment.correlationId! };
  if (attachment.extractionStatus !== "COMPLETED" || attachment.reviewStatus !== "READY" || !attachment.reviewPayload || !attachment.draftId) throw new ApiValidationError("Document draft must be reviewed and ready before customer.create.");
  assertReviewedValues(input.customer, attachment.extractionPayload, attachment.reviewPayload);
  const claimed = await prisma.customerDocumentAttachment.updateMany({ where: { id: attachment.id, organizationId: input.organizationId, actorUserId: input.actorId, reviewStatus: "READY", committedCustomerId: null }, data: { reviewStatus: "COMMITTING" } });
  if (!claimed.count) throw new ApiValidationError("Document draft is already being committed.");
  return { kind: "CLAIMED" as const, attachment, correlationId: attachment.correlationId!, draftId: attachment.draftId };
}

export async function completeReviewedCustomerDocument(input: Owner & { execution: StoredExecution }): Promise<void> {
  const customerId = input.execution.entityRef?.entityId;
  if (!customerId) throw new ApiValidationError("Customer execution did not return an entity id.");
  await prisma.customerDocumentAttachment.updateMany({ where: { id: input.attachmentRef, organizationId: input.organizationId, actorUserId: input.actorId, reviewStatus: "COMMITTING" }, data: { reviewStatus: "COMMITTED", commitExecutionId: input.execution.executionId, committedCustomerId: customerId, commitResult: input.execution as unknown as Prisma.InputJsonValue } });
}

export async function failReviewedCustomerDocument(input: Owner): Promise<void> {
  await prisma.customerDocumentAttachment.updateMany({ where: { id: input.attachmentRef, organizationId: input.organizationId, actorUserId: input.actorId, reviewStatus: "COMMITTING", committedCustomerId: null }, data: { reviewStatus: "READY" } });
}
