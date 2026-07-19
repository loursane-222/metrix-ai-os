import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { resolveExecutionPermissions } from "@/lib/action-runtime/gateway/execution-context";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { CUSTOMER_BUILT_IN_FIELDS, customerCustomDefinitionToField } from "@/lib/customers/customer-field-registry";
import { detectCustomerDuplicates } from "@/lib/customers/customer-duplicate-detection";
import { mapCustomerAttachmentError, resolveCustomerAttachment } from "@/lib/customers/customer-document-attachment.service";
import { prisma } from "@/lib/core/shared/prisma";
import { recordEvent } from "@/lib/core/events/event.service";
import { canAccessField, mergeCustomFieldDefinitions } from "@/lib/field-authority/field-authority";
import { listCustomerCustomFields } from "@/lib/field-authority/custom-field.service";
import { customerDocumentFieldExtractor } from "@/lib/field-authority/customer-document-field-extractor";
import { validateStructuredExtractionPayload, type StructuredFieldExtractionAdapter } from "@/lib/field-authority/structured-field-ingestion";
import { executiveLifecycleRegistry } from "@/lib/executive-lifecycle";

type ExtractionRequest = { attachmentRef: string; conversationId?: string; targetOperation?: "CREATE_NEW_CUSTOMER" | "UPDATE_EXISTING_CUSTOMER" };

function strictRequest(raw: unknown): ExtractionRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_EXTRACTION_REQUEST");
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["attachmentRef", "conversationId", "targetOperation"].includes(key)) || typeof value.attachmentRef !== "string" || (value.conversationId !== undefined && typeof value.conversationId !== "string") || (value.targetOperation !== undefined && !["CREATE_NEW_CUSTOMER", "UPDATE_EXISTING_CUSTOMER"].includes(String(value.targetOperation)))) throw new Error("INVALID_EXTRACTION_REQUEST");
  return value as ExtractionRequest;
}

function confidenceSummary(values: Array<{ confidence: number }>) {
  if (!values.length) return { min: 0, max: 0, average: 0 };
  const scores = values.map((item) => item.confidence);
  return { min: Math.min(...scores), max: Math.max(...scores), average: scores.reduce((sum, value) => sum + value, 0) / scores.length };
}

async function extractionEvent(input: { eventType: string; organizationId: string; actorId: string; requestId: string; filename: string; mimeType: string; size: number; payload?: Record<string, unknown> }) {
  await recordEvent({ organizationId: input.organizationId, actorUserId: input.actorId, eventType: input.eventType, entityType: "customer_document_extraction", entityId: input.requestId, source: "USER", payload: { requestId: input.requestId, filename: input.filename, mimeType: input.mimeType, fileSize: input.size, ...input.payload } as Prisma.InputJsonValue });
}

export async function extractCustomerDocument(request: Request, deps: { extractor: StructuredFieldExtractionAdapter } = { extractor: customerDocumentFieldExtractor }): Promise<Response> {
  let eventContext: { organizationId: string; actorId: string; requestId: string; filename: string; mimeType: string; size: number } | undefined;
  try {
    const auth = await requireAuthContextFromCookies();
    const body = strictRequest(await request.json());
    const attachment = await resolveCustomerAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef: body.attachmentRef, conversationId: body.conversationId });
    if (attachment.extractionStatus === "COMPLETED" && attachment.extractionPayload) return ok(attachment.extractionPayload);
    if (attachment.extractionStatus === "EXTRACTING") return fail("Belge çıkarımı zaten devam ediyor.", 409);
    const requestId = attachment.extractionRequestId ?? randomUUID();
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || attachment.correlationId || randomUUID();
    const claimed = await prisma.customerDocumentAttachment.updateMany({ where: { id: attachment.id, organizationId: auth.organization.id, actorUserId: auth.user.id, extractionStatus: { in: ["READY", "FAILED"] } }, data: { extractionStatus: "EXTRACTING", extractionRequestId: requestId, extractionErrorCode: null, correlationId } });
    if (!claimed.count) return fail("Belge çıkarımı zaten devam ediyor.", 409);
    eventContext = { organizationId: auth.organization.id, actorId: auth.user.id, requestId, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.sizeBytes };
    executiveLifecycleRegistry.publish({ envelopeId: `extraction:${requestId}:extracting`, source: "extraction", phase: "extracting", status: "active", timestamp: Date.now(), correlationId, sessionId: correlationId, organizationId: auth.organization.id, actorId: auth.user.id, module: "customers", summary: "Belge alanları çıkarılıyor", document: { documentId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType } });
    await extractionEvent({ ...eventContext, eventType: "CustomerDocumentExtractionRequested", payload: { targetOperation: body.targetOperation ?? "CREATE_NEW_CUSTOMER" } });
    const custom = await listCustomerCustomFields(auth.organization.id);
    const registry = mergeCustomFieldDefinitions(CUSTOMER_BUILT_IN_FIELDS, custom.map((record) => customerCustomDefinitionToField({ id: record.id, organizationId: record.organizationId, key: record.key, label: record.label, description: record.description, valueType: record.valueType, required: record.required, options: record.optionsJson, metadata: record.validationJson, defaultValue: record.defaultValueJson, active: record.active })));
    const permissions = resolveExecutionPermissions(auth.membership.role);
    const safeFields = registry.filter((field) => canAccessField(field, { operation: "create", permissions }).writable);
    const raw = await deps.extractor.extract({ sourceId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType, bytes: new Uint8Array(attachment.content), safeFields: safeFields.map(({ fieldId, label, valueType }) => ({ fieldId, label, valueType })) });
    const extraction = validateStructuredExtractionPayload(raw, safeFields);
    const candidateValues = Object.fromEntries(extraction.candidates.map((candidate) => [candidate.fieldId, candidate.normalizedValue]));
    const duplicates = await detectCustomerDuplicates(auth.organization.id, candidateValues);
    const payload = { lifecycle: duplicates.some((item) => item.strength === "STRONG") ? "DUPLICATE_CONFLICT" : "REVIEW_REQUIRED", attachment: { attachmentRef: attachment.id, conversationId: attachment.conversationId, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.sizeBytes, expiresAt: attachment.expiresAt.toISOString() }, extractionRequestId: requestId, ...extraction, duplicates, requiresExplicitCommit: true, targetOperation: body.targetOperation ?? "CREATE_NEW_CUSTOMER" };
    await prisma.customerDocumentAttachment.update({ where: { id: attachment.id }, data: { extractionStatus: "COMPLETED", extractionPayload: payload as unknown as Prisma.InputJsonValue, extractedAt: new Date() } });
    const safePayload = { candidateFieldIds: extraction.candidates.map((item) => item.fieldId), candidateCount: extraction.candidates.length, confidenceSummary: confidenceSummary(extraction.candidates), targetOperation: body.targetOperation ?? "CREATE_NEW_CUSTOMER" };
    await extractionEvent({ ...eventContext, eventType: "CustomerDocumentExtractionCompleted", payload: safePayload });
    await extractionEvent({ ...eventContext, eventType: "CustomerDocumentPreviewCreated", payload: { ...safePayload, conflictCount: extraction.candidates.filter((item) => item.conflictStatus === "CONFLICT").length } });
    executiveLifecycleRegistry.publish({ envelopeId: `extraction:${requestId}:extracted`, source: "extraction", phase: "extracted", status: "succeeded", timestamp: Date.now(), correlationId, sessionId: correlationId, organizationId: auth.organization.id, actorId: auth.user.id, module: "customers", summary: "Belge çıkarımı tamamlandı", document: { documentId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType, extractedFieldCount: extraction.candidates.length } });
    executiveLifecycleRegistry.publish({ envelopeId: `preview:${requestId}:ready`, source: "preview", phase: "preview_ready", status: "succeeded", timestamp: Date.now(), correlationId, sessionId: correlationId, organizationId: auth.organization.id, actorId: auth.user.id, module: "customers", summary: "Belge önizlemesi hazır", document: { documentId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType, extractedFieldCount: extraction.candidates.length, previewRef: requestId } });
    return ok(payload);
  } catch (error) {
    if (eventContext) {
      await prisma.customerDocumentAttachment.updateMany({ where: { extractionRequestId: eventContext.requestId, organizationId: eventContext.organizationId }, data: { extractionStatus: "FAILED", extractionErrorCode: "EXTRACTION_FAILED" } }).catch(() => undefined);
      await extractionEvent({ ...eventContext, eventType: "CustomerDocumentExtractionFailed", payload: { failureCode: "EXTRACTION_FAILED" } }).catch(() => undefined);
    }
    const attachmentError = mapCustomerAttachmentError(error);
    if (attachmentError) return fail(attachmentError.message, attachmentError.status);
    if (error instanceof Error && error.message === "INVALID_EXTRACTION_REQUEST") return fail("Geçersiz belge çıkarım isteği.", 400);
    if (error instanceof Error && error.message.startsWith("DOCUMENT_PROVIDER_")) return fail("Belge güvenli biçimde işlenemedi.", 502);
    return mapExecutionErrorToHttpResponse(error);
  }
}
