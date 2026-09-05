import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { mapDocumentAttachmentError } from "@/lib/documents/document-attachment.service";
import { classifyDocumentAttachment } from "@/lib/documents/document-intelligence-orchestrator.service";

export async function POST(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const { attachmentRef } = await context.params;
    const result = await classifyDocumentAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef });
    return ok(result);
  } catch (error) {
    const mapped = mapDocumentAttachmentError(error);
    if (mapped) return fail(mapped.message, mapped.status);
    if (error instanceof Error && error.message.startsWith("DOCUMENT_PROVIDER_")) return fail("Belge güvenli biçimde sınıflandırılamadı.", 502);
    return mapExecutionErrorToHttpResponse(error);
  }
}
