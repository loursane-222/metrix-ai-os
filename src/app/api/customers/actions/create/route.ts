import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeCustomerCreateGateway } from "@/lib/action-runtime/gateway/customer-create-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { validateCustomerCreateBody } from "@/lib/customers/customer-field-authority-input";
import { claimReviewedCustomerDocument, completeReviewedCustomerDocument, failReviewedCustomerDocument } from "@/lib/customers/customer-document-commit-service";
import { recordEvent } from "@/lib/core/events/event.service";
import { Prisma } from "@prisma/client";

export async function POST(request: Request): Promise<Response> {
  let claimedAttachment: { organizationId: string; actorId: string; attachmentRef: string } | undefined;
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const attachmentRef = request.headers.get("X-Customer-Attachment-Ref")?.trim();
    const customer = validateCustomerCreateBody(body);
    const documentCommit = attachmentRef ? await claimReviewedCustomerDocument({ organizationId: authContext.organization.id, actorId: authContext.user.id, attachmentRef, customer }) : undefined;
    if (documentCommit?.kind === "REPLAY") return ok({ execution: documentCommit.execution });
    const attachment = documentCommit?.kind === "CLAIMED" ? documentCommit.attachment : undefined;
    if (attachmentRef) claimedAttachment = { organizationId: authContext.organization.id, actorId: authContext.user.id, attachmentRef };
    if (attachment) await recordEvent({ organizationId: authContext.organization.id, actorUserId: authContext.user.id, eventType: "CustomerDocumentCommitRequested", entityType: "customer_document_extraction", entityId: attachment.extractionRequestId, source: "USER", payload: { requestId: attachment.extractionRequestId, filename: attachment.filename, mimeType: attachment.mimeType, fileSize: attachment.sizeBytes, targetOperation: "CREATE_NEW_CUSTOMER" } as Prisma.InputJsonValue });
    const result = await executeCustomerCreateGateway({
      authContext,
      idempotencyKey: requiredIdempotencyKey(request),
      correlationId: documentCommit?.correlationId || request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
      customer,
    });
    if (claimedAttachment) await completeReviewedCustomerDocument({ ...claimedAttachment, execution: result });
    if (attachment) await recordEvent({ organizationId: authContext.organization.id, actorUserId: authContext.user.id, eventType: "CustomerDocumentCommitCompleted", entityType: "customer_document_extraction", entityId: attachment.extractionRequestId, source: "USER", payload: { requestId: attachment.extractionRequestId, filename: attachment.filename, mimeType: attachment.mimeType, fileSize: attachment.sizeBytes, targetOperation: "CREATE_NEW_CUSTOMER", executionId: result.executionId, customerId: result.entityRef?.entityId } as Prisma.InputJsonValue });
    return ok({ execution: result });
  } catch (error) { if (claimedAttachment) await failReviewedCustomerDocument(claimedAttachment).catch(() => undefined); return mapExecutionErrorToHttpResponse(error); }
}
