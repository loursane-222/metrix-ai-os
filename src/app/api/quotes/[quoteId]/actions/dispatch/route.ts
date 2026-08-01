import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { cancelQuoteDispatchApproval, executeApprovedQuoteDispatch, previewQuoteDispatchRecipient, requestQuoteDispatchApproval } from "@/lib/action-runtime/gateway/quote-dispatch-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";

/**
 * "Teklifi müşteriye gönder"in gerçek dış dünya sınırı — bkz.
 * customers/[customerId]/actions/archive/route.ts aynı desen (request/
 * confirm/cancel). request fazı ayrıca gerçek alıcıyı (ya da eksikse
 * bunun nedenini) önizler — kullanıcı onaylamadan önce nereye gideceğini
 * görür.
 */
export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { quoteId } = await context.params;
    const body = await readJsonObject(request);
    const operation = requiredString(body, "operation");

    if (operation === "request") {
      const [approval, recipientPreview] = await Promise.all([
        requestQuoteDispatchApproval(authContext, quoteId),
        previewQuoteDispatchRecipient(authContext, quoteId),
      ]);
      return ok({ approval: { approvalId: approval.approvalId, expiresAt: approval.expiresAt, quoteId }, recipientPreview });
    }

    const approvalId = requiredString(body, "approvalId");
    if (operation === "cancel") {
      await cancelQuoteDispatchApproval(authContext, approvalId);
      return ok({ cancelled: true });
    }
    if (operation !== "confirm") throw new Error("INVALID_OPERATION");

    const execution = await executeApprovedQuoteDispatch({
      authContext,
      quoteId,
      approvalId,
      idempotencyKey: requiredIdempotencyKey(request),
      correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
    });
    return ok({ execution });
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
