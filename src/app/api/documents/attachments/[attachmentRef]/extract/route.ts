import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { mapDocumentAttachmentError } from "@/lib/documents/document-attachment.service";
import { extractDocumentAttachment } from "@/lib/documents/document-intelligence-orchestrator.service";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { attachmentRef } = await context.params;
    const outcome = await extractDocumentAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef });

    if (outcome.status === "ALREADY_COMPLETED" || outcome.status === "EXTRACTED") return ok(outcome.payload);
    if (outcome.status === "ALREADY_EXTRACTING" || outcome.status === "CLAIM_FAILED") return fail("Belge çıkarımı zaten devam ediyor.", 409);
    if (outcome.status === "NOT_YET_CLASSIFIED") return fail("Belge önce sınıflandırılmalı.", 409);
    return fail("Bu belge türü için otomatik alan çıkarımı desteklenmiyor.", 422);
  } catch (error) {
    console.error("document_extraction_failed", { errorName: error instanceof Error ? error.name : typeof error, errorMessage: error instanceof Error ? error.message : "UNKNOWN" });
    const mapped = mapDocumentAttachmentError(error);
    if (mapped) return fail(mapped.message, mapped.status);
    if (error instanceof Error && error.message.startsWith("DOCUMENT_PROVIDER_")) return fail("Belge güvenli biçimde işlenemedi.", 502);
    return mapExecutionErrorToHttpResponse(error);
  }
}
