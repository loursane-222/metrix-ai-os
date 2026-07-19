import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createCustomerAttachmentReference, mapCustomerAttachmentError } from "@/lib/customers/customer-document-attachment.service";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 11 * 1024 * 1024) return fail("Dosya 10 MB sınırını aşıyor.", 413);
    const form = await request.formData();
    const file = form.get("file");
    const conversationId = form.get("conversationId");
    if (!(file instanceof File)) return fail("file is required.", 400);
    if (conversationId !== null && typeof conversationId !== "string") return fail("conversationId is invalid.", 400);
    return ok(await createCustomerAttachmentReference({ organizationId: auth.organization.id, actorId: auth.user.id, ...(conversationId ? { conversationId } : {}), file }));
  } catch (error) {
    const mapped = mapCustomerAttachmentError(error);
    return mapped ? fail(mapped.message, mapped.status) : mapExecutionErrorToHttpResponse(error);
  }
}
