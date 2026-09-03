import { randomUUID } from "crypto";
import { requiredIdempotencyKey } from "@/lib/api/validation";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { executeCanonicalOperation, canonicalOperationResultToHttpResponse } from "@/lib/canonical-operation";

export async function POST(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { invoiceId } = await context.params;
    const correlationId = request.headers.get("X-Correlation-Id")?.trim() || randomUUID();
    const result = await executeCanonicalOperation(
      {
        operationId: requiredIdempotencyKey(request),
        correlationId,
        organizationId: authContext.organization.id,
        actorId: authContext.user.id,
        source: "system",
        type: "UPDATE",
        domain: "invoice",
        entity: { entityType: "invoice", entityId: invoiceId },
        capability: "invoice.send",
        payload: { invoiceId },
        revealIntent: { explicit: false },
      },
      { authContext },
    );
    return canonicalOperationResultToHttpResponse(result, "invoice.send");
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
