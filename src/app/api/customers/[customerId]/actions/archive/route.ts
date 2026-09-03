import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { readJsonObject, requiredIdempotencyKey, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { cancelCustomerArchiveApproval, requestCustomerArchiveApproval } from "@/lib/action-runtime/gateway/customer-archive-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

/**
 * request/cancel: approval creation/revocation only — unchanged, this is
 * policy/approval-service territory, not capability execution.
 * confirm: the actual customer.archive mutation now runs through the
 * Universal Capability Runtime, with the already-granted approval passed
 * as approvalContext — executeCanonicalOperation resolves it via the same
 * executeApprovedAction primitive (context-hash match, idempotent replay,
 * single-use grant consumption) the old gateway used directly.
 */
export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { customerId } = await context.params;
    const body = await readJsonObject(request);
    const operation = requiredString(body, "operation");
    if (operation === "request") {
      const approval = await requestCustomerArchiveApproval(authContext, customerId);
      return ok({ approval: { approvalId: approval.approvalId, expiresAt: approval.expiresAt, customerId } });
    }
    const approvalId = requiredString(body, "approvalId");
    if (operation === "cancel") {
      await cancelCustomerArchiveApproval(authContext, approvalId);
      return ok({ cancelled: true });
    }
    if (operation !== "confirm") throw new Error("INVALID_OPERATION");

    const idempotencyKey = requiredIdempotencyKey(request);
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: idempotencyKey,
        correlationId,
        organizationId: authContext.organization.id,
        actorId: authContext.user.id,
        source: "system",
        type: "ARCHIVE",
        domain: "customer",
        entity: { entityType: "customer", entityId: customerId },
        capability: "customer.archive",
        payload: { customerId },
        revealIntent: { explicit: false },
      },
      { authContext, approvalContext: { approvalId, grantedBy: authContext.user.id } },
    );
    return canonicalOperationResultToHttpResponse(result, "customer.archive");
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
