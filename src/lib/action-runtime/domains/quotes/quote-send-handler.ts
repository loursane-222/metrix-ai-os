import { sendQuoteToCustomer } from "@/lib/core/quotes/quote.service";

import { buildQuoteSentDomainEvent } from "./quote-domain-events";
import { QuoteUpdateInputError } from "./quote-update.errors";
import type { ActionExecutionEnvelope, ActionHandler, HandlerResult } from "../../execution";

/**
 * quote.send'in gerçek Domain Action handler'ı: METRIX'in gerçek üretim
 * eylemi (DRAFT -> SENT geçişi, QuoteEvent, Notification) burada tetiklenir.
 * Müşteriye giden bir e-posta/SMS kanalı henüz bağlanmadı — quote.service'in
 * sendQuoteToCustomer'ı bunu icat etmiyor, yalnızca METRIX içi durumu ve
 * bildirimi gerçek şekilde ilerletiyor.
 */
export const quoteSendHandler: ActionHandler = async (
  envelope: ActionExecutionEnvelope,
): Promise<HandlerResult> => {
  const { quoteId } = envelope.input;
  if (typeof quoteId !== "string" || quoteId.trim().length === 0) {
    throw new QuoteUpdateInputError(["quoteId is required."]);
  }

  const organizationId = envelope.executionContext.organizationId;
  const actorId = envelope.executionContext.actorId;

  const { quote } = await sendQuoteToCustomer({ quoteId, organizationId, actorId });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "quote", entityId: quoteId },
    resultSummary: `Quote sent to ${quote.customerName}.`,
    metadata: { sentAt: quote.sentAt?.toISOString() ?? null, status: quote.status },
    domainEvents: [buildQuoteSentDomainEvent(quoteId, actorId)],
    sideEffects: [],
  };
};
