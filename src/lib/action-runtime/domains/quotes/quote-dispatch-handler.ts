import { dispatchQuoteToCustomerEmail } from "@/lib/core/quotes/quote.service";

import { QuoteUpdateInputError } from "./quote-update.errors";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

/**
 * quote.dispatch'in gerçek Domain Action handler'ı — METRIX'in gerçek dış
 * dünya eylemi: teklifi Resend üzerinden müşterinin kayıtlı e-posta adresine
 * gönderir. approvalPolicy: "EXPLICIT" olduğu için bu handler yalnızca
 * onaylanmış bir ApprovalGrant ile çalışır (bkz. quote-dispatch-gateway.ts,
 * customer-archive-gateway.ts ile aynı desen).
 */
export const quoteDispatchHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { quoteId } = envelope.input;
  if (typeof quoteId !== "string" || quoteId.trim().length === 0) {
    throw new QuoteUpdateInputError(["quoteId is required."]);
  }

  const organizationId = envelope.executionContext.organizationId;
  const actorId = envelope.executionContext.actorId;

  const result = await dispatchQuoteToCustomerEmail({ quoteId, organizationId, actorId });

  const entityRef = { entityType: "quote", entityId: quoteId };

  if (result.outcome === "NOT_SENT") {
    return { status: "SUCCESS", entityRef, resultOutcome: "NO_CHANGE", resultSummary: "Quote has not been sent yet; dispatch skipped.", metadata: { outcome: result.outcome }, domainEvents: [], sideEffects: [] };
  }
  if (result.outcome === "MISSING_RECIPIENT_EMAIL") {
    return { status: "SUCCESS", entityRef, resultOutcome: "NO_CHANGE", resultSummary: "Customer has no email on file; dispatch skipped.", metadata: { outcome: result.outcome }, domainEvents: [], sideEffects: [] };
  }
  if (result.outcome === "PROVIDER_FAILED") {
    throw new Error(result.error);
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: `Quote dispatched to ${result.recipientEmail}.`,
    metadata: { outcome: result.outcome, recipientEmail: result.recipientEmail, providerMessageId: result.providerMessageId },
    domainEvents: [],
    sideEffects: [],
  };
};
