import { randomUUID } from "crypto";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { ApiValidationError } from "@/lib/api/validation";
import { executeCustomerUpdateGateway } from "@/lib/action-runtime/gateway/customer-update-gateway";
import { getCustomerByIdForOrganization } from "@/lib/core/customers/customer.service";
import { CUSTOMER_BUILT_IN_FIELDS } from "./customer-field-registry";
import { resolveCustomerAttachment } from "./customer-document-attachment.service";

function assignPatch(patch: Record<string, unknown>, key: string, value: unknown): void {
  const [root, nested] = key.split(".");
  if (!nested) { patch[root] = value; return; }
  patch[root] = { ...(patch[root] as Record<string, unknown> | undefined), [nested]: value };
}

export async function executeDocumentDuplicateUpdate(input: { authContext: AuthContext; attachmentRef: string; customerId: string; idempotencyKey: string; correlationId?: string }) {
  const organizationId = input.authContext.organization.id;
  const actorId = input.authContext.user.id;
  const attachment = await resolveCustomerAttachment({ organizationId, actorId, attachmentRef: input.attachmentRef });
  if (attachment.extractionStatus !== "COMPLETED" || attachment.reviewStatus !== "READY" || !attachment.reviewPayload) throw new ApiValidationError("Document draft must be reviewed before duplicate update.");
  const extraction = attachment.extractionPayload as { candidates?: Array<{ fieldId?: unknown; normalizedValue?: unknown }>; duplicates?: Array<{ customerId?: unknown; strength?: unknown }> } | null;
  if (!extraction?.duplicates?.some((item) => item.customerId === input.customerId && item.strength === "STRONG")) throw new ApiValidationError("Selected customer is not a trusted duplicate match.");
  const review = attachment.reviewPayload as { accepted?: unknown; edits?: unknown };
  const accepted = Array.isArray(review.accepted) ? review.accepted.filter((id): id is string => typeof id === "string") : [];
  const edits = review.edits && typeof review.edits === "object" && !Array.isArray(review.edits) ? review.edits as Record<string, unknown> : {};
  const patch: Record<string, unknown> = {};
  const customFields: Array<{ definitionId: string; value: unknown }> = [];
  for (const fieldId of accepted) {
    const candidate = extraction.candidates?.find((item) => item.fieldId === fieldId);
    if (!candidate) continue;
    const value = Object.prototype.hasOwnProperty.call(edits, fieldId) ? edits[fieldId] : candidate.normalizedValue;
    if (fieldId.startsWith("customer.custom.")) customFields.push({ definitionId: fieldId.slice("customer.custom.".length), value });
    else { const field = CUSTOMER_BUILT_IN_FIELDS.find((item) => item.fieldId === fieldId); if (field?.writable) assignPatch(patch, field.key, value); }
  }
  if (customFields.length) patch.customFields = customFields;
  if (!Object.keys(patch).length) throw new ApiValidationError("No reviewed fields are available for duplicate update.");
  const current = await getCustomerByIdForOrganization(input.customerId, organizationId);
  if (!current) throw new ApiValidationError("Duplicate customer is no longer available.");
  const expectedVersion = current.updatedAt.toISOString();
  const correlationId = attachment.correlationId || input.correlationId || randomUUID();
  const execution = await executeCustomerUpdateGateway({ authContext: input.authContext, customerId: input.customerId, patch, expectedVersion, idempotencyKey: input.idempotencyKey, correlationId });
  const verified = await getCustomerByIdForOrganization(input.customerId, organizationId);
  if (!verified) throw new ApiValidationError("Updated customer could not be verified.");
  return { execution, expectedVersion, resultingVersion: verified.updatedAt.toISOString(), customerId: verified.id, correlationId };
}
