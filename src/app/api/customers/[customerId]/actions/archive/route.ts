import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { cancelCustomerArchiveApproval, executeApprovedCustomerArchive, requestCustomerArchiveApproval } from "@/lib/action-runtime/gateway/customer-archive-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";

export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { customerId } = await context.params;
    const body = await readJsonObject(request);
    const operation = requiredString(body, "operation");
    if (operation === "request") {
      const approval = requestCustomerArchiveApproval(authContext, customerId);
      return ok({ approval: { approvalId: approval.approvalId, expiresAt: approval.expiresAt, customerId } });
    }
    const approvalId = requiredString(body, "approvalId");
    if (operation === "cancel") {
      cancelCustomerArchiveApproval(authContext, approvalId);
      return ok({ cancelled: true });
    }
    if (operation !== "confirm") throw new Error("INVALID_OPERATION");
    const execution = await executeApprovedCustomerArchive({ authContext, customerId, approvalId, idempotencyKey: requiredIdempotencyKey(request), correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID() });
    return ok({ execution });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
