import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { mapDocumentAttachmentError, resolveDocumentAttachment } from "@/lib/documents/document-attachment.service";
import { documentClassifier } from "@/lib/documents/document-classifier";
import { prisma } from "@/lib/core/shared/prisma";
import { recordEvent } from "@/lib/core/events/event.service";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { attachmentRef } = await context.params;
    const attachment = await resolveDocumentAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef });

    if (attachment.classifiedDomain) {
      return ok({ domain: attachment.classifiedDomain, confidence: attachment.classificationConfidence, needsReview: attachment.classifiedDomain === "UNKNOWN" });
    }

    const classification = await documentClassifier.classify({ sourceId: attachment.id, filename: attachment.filename, mediaType: attachment.mimeType, bytes: new Uint8Array(attachment.content) });
    await prisma.customerDocumentAttachment.update({
      where: { id: attachment.id, organizationId: auth.organization.id },
      data: { classifiedDomain: classification.domain, classificationConfidence: classification.confidence, classificationPayload: classification },
    });
    await recordEvent({
      organizationId: auth.organization.id,
      actorUserId: auth.user.id,
      eventType: "DocumentClassified",
      entityType: "document_attachment",
      entityId: attachment.id,
      source: "USER",
      payload: { attachmentId: attachment.id, domain: classification.domain, confidence: classification.confidence, filename: attachment.filename, mimeType: attachment.mimeType },
    });
    return ok({ domain: classification.domain, confidence: classification.confidence, needsReview: classification.needsReview });
  } catch (error) {
    const mapped = mapDocumentAttachmentError(error);
    if (mapped) return fail(mapped.message, mapped.status);
    if (error instanceof Error && error.message.startsWith("DOCUMENT_PROVIDER_")) return fail("Belge güvenli biçimde sınıflandırılamadı.", 502);
    return mapExecutionErrorToHttpResponse(error);
  }
}
