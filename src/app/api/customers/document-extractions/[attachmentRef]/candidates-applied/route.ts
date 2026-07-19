import { Prisma } from "@prisma/client";
import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { mapCustomerAttachmentError, resolveCustomerAttachment } from "@/lib/customers/customer-document-attachment.service";
import { recordEvent } from "@/lib/core/events/event.service";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies(); const { attachmentRef } = await context.params; const attachment = await resolveCustomerAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef });
    const body = await request.json() as unknown; if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["accepted", "rejected", "edited"].includes(key))) return fail("Geçersiz aday kararı.", 400);
    const value = body as Record<string, unknown>; if (!Array.isArray(value.accepted) || !Array.isArray(value.rejected) || !Array.isArray(value.edited) || [...value.accepted, ...value.rejected, ...value.edited].some((id) => typeof id !== "string")) return fail("Geçersiz aday kararı.", 400);
    const preview = attachment.extractionPayload as Record<string, unknown> | null; const candidates = Array.isArray(preview?.candidates) ? preview.candidates as Array<Record<string, unknown>> : []; const allowed = new Set(candidates.map((item) => item.fieldId).filter((id): id is string => typeof id === "string")); if ([...value.accepted, ...value.rejected, ...value.edited].some((id) => !allowed.has(id as string))) return fail("Aday alanı bu önizlemeye ait değil.", 400);
    await recordEvent({ organizationId: auth.organization.id, actorUserId: auth.user.id, eventType: "CustomerDocumentCandidatesApplied", entityType: "customer_document_extraction", entityId: attachment.extractionRequestId, source: "USER", payload: { requestId: attachment.extractionRequestId, filename: attachment.filename, mimeType: attachment.mimeType, fileSize: attachment.sizeBytes, candidateFieldIds: [...allowed], candidateCount: allowed.size, acceptedCount: value.accepted.length, rejectedCount: value.rejected.length, conflictCount: candidates.filter((item) => item.conflictStatus === "CONFLICT").length, editedCount: value.edited.length } as Prisma.InputJsonValue });
    return ok({ recorded: true });
  } catch (error) { const mapped = mapCustomerAttachmentError(error); return mapped ? fail(mapped.message, mapped.status) : mapExecutionErrorToHttpResponse(error); }
}
