import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { mapDocumentAttachmentError, resolveDocumentAttachment } from "@/lib/documents/document-attachment.service";
import { fieldRegistryForDomain } from "@/lib/documents/document-field-registries";
import { createDocumentFieldExtractor } from "@/lib/documents/document-field-extractor";
import { validateStructuredExtractionPayload } from "@/lib/field-authority/structured-field-ingestion";
import { buildAndPersistDocumentCandidate } from "@/lib/documents/document-candidate-builder";
import { prisma } from "@/lib/core/shared/prisma";
import { recordEvent } from "@/lib/core/events/event.service";
import type { Prisma } from "@prisma/client";
import type { DocumentDomain } from "@/lib/documents/document-classifier";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  let eventContext: { organizationId: string; actorId: string; attachmentId: string; filename: string; mimeType: string } | undefined;
  try {
    const auth = await requireAuthContextFromCookies();
    const { attachmentRef } = await context.params;
    const attachment = await resolveDocumentAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef });

    if (attachment.extractionStatus === "COMPLETED" && attachment.extractionPayload) return ok(attachment.extractionPayload);
    if (attachment.extractionStatus === "EXTRACTING") return fail("Belge çıkarımı zaten devam ediyor.", 409);
    if (!attachment.classifiedDomain) return fail("Belge önce sınıflandırılmalı.", 409);
    const domain = attachment.classifiedDomain as DocumentDomain;
    const registry = fieldRegistryForDomain(domain);
    if (!registry) return fail("Bu belge türü için otomatik alan çıkarımı desteklenmiyor.", 422);

    const claimed = await prisma.customerDocumentAttachment.updateMany({ where: { id: attachment.id, organizationId: auth.organization.id, actorUserId: auth.user.id, extractionStatus: { in: ["READY", "FAILED"] } }, data: { extractionStatus: "EXTRACTING", extractionErrorCode: null } });
    if (!claimed.count) return fail("Belge çıkarımı zaten devam ediyor.", 409);
    eventContext = { organizationId: auth.organization.id, actorId: auth.user.id, attachmentId: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType };
    await recordEvent({ organizationId: auth.organization.id, actorUserId: auth.user.id, eventType: "DocumentExtractionRequested", entityType: "document_attachment", entityId: attachment.id, source: "USER", payload: { attachmentId: attachment.id, domain } });

    const extractor = createDocumentFieldExtractor({ domainLabel: domain });
    const raw = await extractor.extract({ sourceId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType, bytes: new Uint8Array(attachment.content), safeFields: registry.map(({ fieldId, label, valueType }) => ({ fieldId, label, valueType })) });
    const extraction = validateStructuredExtractionPayload(raw, registry);

    const build = await buildAndPersistDocumentCandidate({
      organizationId: auth.organization.id,
      actorId: auth.user.id,
      conversationId: attachment.conversationId,
      attachmentId: attachment.id,
      domain,
      extraction,
    });

    const payload = { attachment: { attachmentRef: attachment.id, conversationId: attachment.conversationId, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.sizeBytes, expiresAt: attachment.expiresAt.toISOString() }, domain, extraction, build };
    await prisma.customerDocumentAttachment.update({
      where: { id: attachment.id, organizationId: auth.organization.id },
      data: {
        extractionStatus: "COMPLETED",
        extractionPayload: payload as unknown as Prisma.InputJsonValue,
        extractedAt: new Date(),
        ...(build.status === "CREATED" ? { businessCandidateId: build.candidateId } : {}),
      },
    });
    await recordEvent({ organizationId: auth.organization.id, actorUserId: auth.user.id, eventType: build.status === "CREATED" ? "DocumentExtractionCandidateCreated" : "DocumentExtractionNeedsReview", entityType: "document_attachment", entityId: attachment.id, source: "USER", payload: { attachmentId: attachment.id, domain, candidateFieldCount: extraction.candidates.length, ...(build.status === "CREATED" ? { businessCandidateId: build.candidateId } : { reason: build.reason }) } });
    return ok(payload);
  } catch (error) {
    console.error("document_extraction_failed", { errorName: error instanceof Error ? error.name : typeof error, errorMessage: error instanceof Error ? error.message : "UNKNOWN", attachmentId: eventContext?.attachmentId ?? null });
    if (eventContext) {
      await prisma.customerDocumentAttachment.updateMany({ where: { id: eventContext.attachmentId, organizationId: eventContext.organizationId }, data: { extractionStatus: "FAILED", extractionErrorCode: "EXTRACTION_FAILED" } }).catch(() => {});
    }
    const mapped = mapDocumentAttachmentError(error);
    if (mapped) return fail(mapped.message, mapped.status);
    if (error instanceof Error && error.message.startsWith("DOCUMENT_PROVIDER_")) return fail("Belge güvenli biçimde işlenemedi.", 502);
    return mapExecutionErrorToHttpResponse(error);
  }
}
