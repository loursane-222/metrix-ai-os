import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { bindCustomerAttachmentToConversation, deleteCustomerAttachment, mapCustomerAttachmentError, resolveCustomerAttachment } from "@/lib/customers/customer-document-attachment.service";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";

export async function GET(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try { const auth = await requireAuthContextFromCookies(); const { attachmentRef } = await context.params; const conversationId = new URL(request.url).searchParams.get("conversationId") ?? undefined; const row = await resolveCustomerAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef, conversationId }); return ok({ attachmentRef: row.id, conversationId: row.conversationId, filename: row.filename, mimeType: row.mimeType, size: row.sizeBytes, expiresAt: row.expiresAt.toISOString(), extractionStatus: row.extractionStatus, extractionRequestId: row.extractionRequestId, preview: row.extractionPayload }); } catch (error) { const mapped = mapCustomerAttachmentError(error); return mapped ? fail(mapped.message, mapped.status) : mapExecutionErrorToHttpResponse(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try { const auth = await requireAuthContextFromCookies(); const { attachmentRef } = await context.params; const body = await request.json() as unknown; if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "conversationId") || typeof (body as Record<string, unknown>).conversationId !== "string") return fail("conversationId is required.", 400); const row = await bindCustomerAttachmentToConversation({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef, conversationId: (body as { conversationId: string }).conversationId }); return ok({ attachmentRef: row.id, conversationId: row.conversationId }); } catch (error) { const mapped = mapCustomerAttachmentError(error); return mapped ? fail(mapped.message, mapped.status) : mapExecutionErrorToHttpResponse(error); }
}
export async function DELETE(_: Request, context: { params: Promise<{ attachmentRef: string }> }): Promise<Response> {
  try { const auth = await requireAuthContextFromCookies(); const { attachmentRef } = await context.params; await deleteCustomerAttachment({ organizationId: auth.organization.id, actorId: auth.user.id, attachmentRef }); return ok({ cancelled: true }); } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
