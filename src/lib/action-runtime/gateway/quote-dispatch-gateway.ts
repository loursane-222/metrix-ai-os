import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { policyEngine } from "../policy";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { PolicyDeniedError } from "../execution";
import { executeApprovedAction } from "./approved-action-execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "./execution-request";
import { findQuoteByIdForOrganization } from "@/lib/core/quotes/quote.service";
import { getCustomerById } from "@/lib/core/customers/customer.repository";

/** Bkz. customer-archive-gateway.ts — quote.dispatch için aynı EXPLICIT approval deseni. */
function base(authContext: AuthContext, quoteId: string) {
  const input = { quoteId };
  const entityRef = { entityType: "quote", entityId: quoteId };
  return {
    input,
    entityRef,
    executionContext: buildExecutionContext(authContext),
    normalizedInputHash: computeNormalizedInputHash({ actionName: "quote.dispatch", input, entityRef }),
  };
}

export type QuoteDispatchRecipientPreview =
  | { status: "RESOLVED"; email: string }
  | { status: "MISSING_EMAIL" }
  | { status: "NOT_SENT" };

/** Read-only preview of who the dispatch would actually reach — shown to the user before they approve. */
export async function previewQuoteDispatchRecipient(authContext: AuthContext, quoteId: string): Promise<QuoteDispatchRecipientPreview> {
  const quote = await findQuoteByIdForOrganization(quoteId, authContext.organization.id);
  if (!quote) return { status: "MISSING_EMAIL" };
  if (quote.status === "DRAFT" || quote.status === "NEGOTIATION") return { status: "NOT_SENT" };
  if (!quote.customerId) return { status: "MISSING_EMAIL" };
  const customer = await getCustomerById(quote.customerId, authContext.organization.id);
  const email = customer?.email?.trim();
  return email ? { status: "RESOLVED", email } : { status: "MISSING_EMAIL" };
}

export async function requestQuoteDispatchApproval(authContext: AuthContext, quoteId: string) {
  const candidate = base(authContext, quoteId);
  const decision = await policyEngine.evaluatePolicy({ actionName: "quote.dispatch", actorContext: candidate.executionContext, targetEntityRef: candidate.entityRef, normalizedInputHash: candidate.normalizedInputHash });
  if (decision.outcome === "DENY") throw new PolicyDeniedError("quote.dispatch", decision.reasonCode);
  if (!decision.approvalRequest) throw new Error("APPROVAL_NOT_CREATED");
  return decision.approvalRequest;
}

export async function cancelQuoteDispatchApproval(authContext: AuthContext, approvalId: string) {
  const request = await policyEngine.getApprovalRequest(approvalId);
  if (request.actorId !== authContext.user.id || request.organizationId !== authContext.organization.id || request.actionName !== "quote.dispatch") {
    throw new Error("APPROVAL_NOT_FOUND");
  }
  await policyEngine.revokeApproval(approvalId, authContext.user.id);
}

export async function executeApprovedQuoteDispatch(input: { authContext: AuthContext; quoteId: string; approvalId: string; idempotencyKey: string; correlationId: string }) {
  const candidate = base(input.authContext, input.quoteId);
  return executeApprovedAction({
    approvalId: input.approvalId,
    grantedBy: input.authContext.user.id,
    request: buildActionExecutionRequest({
      actionName: "quote.dispatch",
      input: candidate.input,
      entityRef: candidate.entityRef,
      executionContext: candidate.executionContext,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      runtimeRiskContext: { externalSideEffect: true, reversibilityClass: "IRREVERSIBLE" },
    }),
  }, { policy: policyEngine, runtime: productionExecutionRuntime });
}
