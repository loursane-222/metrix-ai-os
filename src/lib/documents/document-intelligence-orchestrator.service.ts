/**
 * Shared classify/extract core for document intelligence — extracted
 * verbatim from the two API routes that used to inline this logic
 * (src/app/api/documents/attachments/[attachmentRef]/classify/route.ts and
 * .../extract/route.ts), so both the HTTP routes AND the Executive Agent's
 * analyze_active_document_attachment tool call the exact same functions.
 * No OCR/extraction/business logic was rewritten — only moved. Error
 * mapping (HTTP status codes, DOCUMENT_PROVIDER_* detection) stays the
 * caller's responsibility, same as before this extraction.
 */

import { prisma } from "@/lib/core/shared/prisma";
import { recordEvent } from "@/lib/core/events/event.service";
import { resolveDocumentAttachment } from "@/lib/documents/document-attachment.service";
import { documentClassifier, type DocumentDomain } from "@/lib/documents/document-classifier";
import { fieldRegistryForDomain } from "@/lib/documents/document-field-registries";
import { createDocumentFieldExtractor } from "@/lib/documents/document-field-extractor";
import { validateStructuredExtractionPayload } from "@/lib/field-authority/structured-field-ingestion";
import { buildAndPersistDocumentCandidate } from "@/lib/documents/document-candidate-builder";
import type { Prisma } from "@prisma/client";

export type DocumentClassificationResult = { domain: DocumentDomain; confidence: number; needsReview: boolean };

export async function classifyDocumentAttachment(input: { organizationId: string; actorId: string; attachmentRef: string }): Promise<DocumentClassificationResult> {
  const attachment = await resolveDocumentAttachment(input);

  if (attachment.classifiedDomain) {
    return { domain: attachment.classifiedDomain as DocumentDomain, confidence: attachment.classificationConfidence ?? 0, needsReview: attachment.classifiedDomain === "UNKNOWN" };
  }

  const classification = await documentClassifier.classify({ sourceId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType, bytes: new Uint8Array(attachment.content) });
  await prisma.customerDocumentAttachment.update({
    where: { id: attachment.id, organizationId: input.organizationId },
    data: { classifiedDomain: classification.domain, classificationConfidence: classification.confidence, classificationPayload: classification },
  });
  await recordEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorId,
    eventType: "DocumentClassified",
    entityType: "document_attachment",
    entityId: attachment.id,
    source: "USER",
    payload: { attachmentId: attachment.id, domain: classification.domain, confidence: classification.confidence, filename: attachment.filename, mimeType: attachment.mimeType },
  });
  return { domain: classification.domain, confidence: classification.confidence, needsReview: classification.needsReview };
}

export type DocumentExtractionOutcome =
  | Readonly<{ status: "ALREADY_COMPLETED"; payload: unknown }>
  | Readonly<{ status: "ALREADY_EXTRACTING" }>
  | Readonly<{ status: "NOT_YET_CLASSIFIED" }>
  | Readonly<{ status: "UNSUPPORTED_DOMAIN" }>
  | Readonly<{ status: "CLAIM_FAILED" }>
  | Readonly<{ status: "EXTRACTED"; payload: unknown }>;

export async function extractDocumentAttachment(input: { organizationId: string; actorId: string; attachmentRef: string }): Promise<DocumentExtractionOutcome> {
  const attachment = await resolveDocumentAttachment(input);

  if (attachment.extractionStatus === "COMPLETED" && attachment.extractionPayload) return { status: "ALREADY_COMPLETED", payload: attachment.extractionPayload };
  if (attachment.extractionStatus === "EXTRACTING") return { status: "ALREADY_EXTRACTING" };
  if (!attachment.classifiedDomain) return { status: "NOT_YET_CLASSIFIED" };
  const domain = attachment.classifiedDomain as DocumentDomain;
  const registry = fieldRegistryForDomain(domain);
  if (!registry) return { status: "UNSUPPORTED_DOMAIN" };

  const claimed = await prisma.customerDocumentAttachment.updateMany({ where: { id: attachment.id, organizationId: input.organizationId, actorUserId: input.actorId, extractionStatus: { in: ["READY", "FAILED"] } }, data: { extractionStatus: "EXTRACTING", extractionErrorCode: null } });
  if (!claimed.count) return { status: "CLAIM_FAILED" };

  try {
    await recordEvent({ organizationId: input.organizationId, actorUserId: input.actorId, eventType: "DocumentExtractionRequested", entityType: "document_attachment", entityId: attachment.id, source: "USER", payload: { attachmentId: attachment.id, domain } });

    const extractor = createDocumentFieldExtractor({ domainLabel: domain });
    const raw = await extractor.extract({ sourceId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType, bytes: new Uint8Array(attachment.content), safeFields: registry.map(({ fieldId, label, valueType }) => ({ fieldId, label, valueType })) });
    const extraction = validateStructuredExtractionPayload(raw, registry);

    const build = await buildAndPersistDocumentCandidate({
      organizationId: input.organizationId,
      actorId: input.actorId,
      conversationId: attachment.conversationId,
      attachmentId: attachment.id,
      domain,
      extraction,
    });

    const payload = { attachment: { attachmentRef: attachment.id, conversationId: attachment.conversationId, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.sizeBytes, expiresAt: attachment.expiresAt.toISOString() }, domain, extraction, build };
    await prisma.customerDocumentAttachment.update({
      where: { id: attachment.id, organizationId: input.organizationId },
      data: {
        extractionStatus: "COMPLETED",
        extractionPayload: payload as unknown as Prisma.InputJsonValue,
        extractedAt: new Date(),
        ...(build.status === "CREATED" ? { businessCandidateId: build.candidateId } : {}),
      },
    });
    await recordEvent({ organizationId: input.organizationId, actorUserId: input.actorId, eventType: build.status === "CREATED" ? "DocumentExtractionCandidateCreated" : "DocumentExtractionNeedsReview", entityType: "document_attachment", entityId: attachment.id, source: "USER", payload: { attachmentId: attachment.id, domain, candidateFieldCount: extraction.candidates.length, ...(build.status === "CREATED" ? { businessCandidateId: build.candidateId } : { reason: build.reason }) } });
    return { status: "EXTRACTED", payload };
  } catch (error) {
    await prisma.customerDocumentAttachment.updateMany({ where: { id: attachment.id, organizationId: input.organizationId }, data: { extractionStatus: "FAILED", extractionErrorCode: "EXTRACTION_FAILED" } }).catch(() => {});
    throw error;
  }
}
