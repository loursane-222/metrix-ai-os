import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeCustomerCreateGateway } from "@/lib/action-runtime/gateway/customer-create-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { validateCustomerCreateBody } from "@/lib/customers/customer-field-authority-input";
import { resolveCustomerAttachment } from "@/lib/customers/customer-document-attachment.service";
import { recordEvent } from "@/lib/core/events/event.service";
import { Prisma } from "@prisma/client";

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const attachmentRef = request.headers.get("X-Customer-Attachment-Ref")?.trim();
    const attachment = attachmentRef ? await resolveCustomerAttachment({ organizationId: authContext.organization.id, actorId: authContext.user.id, attachmentRef }) : undefined;
    if (attachment) await recordEvent({ organizationId: authContext.organization.id, actorUserId: authContext.user.id, eventType: "CustomerDocumentCommitRequested", entityType: "customer_document_extraction", entityId: attachment.extractionRequestId, source: "USER", payload: { requestId: attachment.extractionRequestId, filename: attachment.filename, mimeType: attachment.mimeType, fileSize: attachment.sizeBytes, targetOperation: "CREATE_NEW_CUSTOMER" } as Prisma.InputJsonValue });
    const result = await executeCustomerCreateGateway({
      authContext,
      idempotencyKey: requiredIdempotencyKey(request),
      correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
      customer: validateCustomerCreateBody(body),
    });
    if (attachment) await recordEvent({ organizationId: authContext.organization.id, actorUserId: authContext.user.id, eventType: "CustomerDocumentCommitCompleted", entityType: "customer_document_extraction", entityId: attachment.extractionRequestId, source: "USER", payload: { requestId: attachment.extractionRequestId, filename: attachment.filename, mimeType: attachment.mimeType, fileSize: attachment.sizeBytes, targetOperation: "CREATE_NEW_CUSTOMER", executionId: result.executionId, customerId: result.entityRef?.entityId } as Prisma.InputJsonValue });
    return ok({ execution: result });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
