import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { mapCustomerAttachmentError, resolveCustomerAttachment } from "@/lib/customers/customer-document-attachment.service";
import { recordEvent } from "@/lib/core/events/event.service";
import { prisma } from "@/lib/core/shared/prisma";
import { executiveLifecycleRegistry } from "@/lib/executive-lifecycle";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies(); const { attachmentRef } = await context.params; const attachment = await resolveCustomerAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef });
    const body = await request.json() as unknown; if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["accepted", "rejected", "edits", "draftId"].includes(key))) return fail("Geçersiz aday kararı.", 400);
    const value = body as Record<string, unknown>;
    const edits = value.edits && typeof value.edits === "object" && !Array.isArray(value.edits) ? value.edits as Record<string, unknown> : {};
    if (!Array.isArray(value.accepted) || !Array.isArray(value.rejected) || [...value.accepted, ...value.rejected, ...Object.keys(edits)].some((id) => typeof id !== "string") || (value.draftId !== undefined && typeof value.draftId !== "string")) return fail("Geçersiz aday kararı.", 400);
    if (attachment.extractionStatus !== "COMPLETED") return fail("Belge çıkarımı tamamlanmadan taslak hazırlanamaz.", 409);
    const preview = attachment.extractionPayload as Record<string, unknown> | null; const candidates = Array.isArray(preview?.candidates) ? preview.candidates as Array<Record<string, unknown>> : []; const allowed = new Set(candidates.map((item) => item.fieldId).filter((id): id is string => typeof id === "string")); if ([...value.accepted, ...value.rejected, ...Object.keys(edits)].some((id) => !allowed.has(id as string))) return fail("Aday alanı bu önizlemeye ait değil.", 400);
    const accepted = [...new Set(value.accepted as string[])];
    const rejected = [...new Set(value.rejected as string[])];
    if (accepted.some((id) => rejected.includes(id))) return fail("Bir aday hem kabul hem reddedilemez.", 400);
    const draftId = typeof value.draftId === "string" && value.draftId.trim() ? value.draftId.trim() : randomUUID();
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || attachment.correlationId || randomUUID();
    const reviewPayload = { accepted, rejected, edits, candidateFieldIds: [...allowed] };
    await prisma.customerDocumentAttachment.update({ where: { id: attachment.id }, data: { reviewStatus: "READY", reviewPayload: reviewPayload as Prisma.InputJsonValue, draftId, correlationId } });
    executiveLifecycleRegistry.publish({ envelopeId: `draft:${draftId}:created`, source: "draft", phase: "created", status: "succeeded", timestamp: Date.now(), correlationId, sessionId: correlationId, organizationId: auth.organization.id, actorId: auth.user.id, module: "customers", entityType: "customer", summary: "Belge taslağı oluşturuldu", draft: { draftId, draftType: "customer.create", changedFields: accepted, sourceDocumentId: attachment.id } });
    executiveLifecycleRegistry.publish({ envelopeId: `draft:${draftId}:ready`, source: "draft", phase: "ready", status: "succeeded", timestamp: Date.now(), correlationId, sessionId: correlationId, organizationId: auth.organization.id, actorId: auth.user.id, module: "customers", entityType: "customer", summary: "Belge taslağı işleme hazır", draft: { draftId, draftType: "customer.create", changedFields: accepted, sourceDocumentId: attachment.id } });
    await recordEvent({ organizationId: auth.organization.id, actorUserId: auth.user.id, eventType: "CustomerDocumentCandidatesApplied", entityType: "customer_document_extraction", entityId: attachment.extractionRequestId, source: "USER", payload: { requestId: attachment.extractionRequestId, filename: attachment.filename, mimeType: attachment.mimeType, fileSize: attachment.sizeBytes, candidateFieldIds: [...allowed], candidateCount: allowed.size, acceptedCount: accepted.length, rejectedCount: rejected.length, conflictCount: candidates.filter((item) => item.conflictStatus === "CONFLICT").length, editedCount: Object.keys(edits).length, draftId, correlationId } as Prisma.InputJsonValue });
    return ok({ recorded: true, draftId, correlationId, status: "READY" });
  } catch (error) { const mapped = mapCustomerAttachmentError(error); return mapped ? fail(mapped.message, mapped.status) : mapExecutionErrorToHttpResponse(error); }
}
