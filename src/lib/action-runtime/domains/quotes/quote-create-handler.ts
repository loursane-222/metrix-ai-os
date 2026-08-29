import { createNewQuote } from "@/lib/core/quotes/quote.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";
import { parseStructuredPaymentTerm } from "@/lib/payment-terms";

export async function handleQuoteCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const customerId = requiredString(envelope.input.customerId, "customerId");
  const title = requiredString(envelope.input.title, "title");
  const amount = envelope.input.amount;
  if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) throw new Error("amount must not be negative.");
  const currency = optionalString(envelope.input.currency);

  // CRITICAL side effect — its failure is the handler's failure.
  const outcome = await createNewQuote({
    organizationId: envelope.executionContext.organizationId,
    customerId,
    title,
    amount,
    currency,
    paymentTermStructured: envelope.input.paymentTermStructured === undefined ? undefined : parseStructuredPaymentTerm(envelope.input.paymentTermStructured),
    idempotencyKey: envelope.idempotencyKey,
    createdByUserId: envelope.executionContext.actorId,
  });

  if (outcome.created) {
    await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "quote.created", title: "Yeni teklif oluşturuldu", body: title, entityType: "Quote", entityId: outcome.quote.id });
  }

  return {
    status: "SUCCESS",
    entityRef: { entityType: "quote", entityId: outcome.quote.id },
    resultSummary: outcome.created ? "Canonical quote created." : "Canonical quote already existed.",
    metadata: { quoteId: outcome.quote.id, duplicate: !outcome.created },
    domainEvents: [],
    sideEffects: [],
    resultOutcome: outcome.created ? undefined : "NO_CHANGE",
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
