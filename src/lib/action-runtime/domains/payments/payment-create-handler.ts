import { createNewPayment } from "@/lib/core/payments/payment.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

export async function handlePaymentCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const customerId = requiredString(envelope.input.customerId, "customerId");
  const title = requiredString(envelope.input.title, "title");
  const amount = envelope.input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number.");
  const currency = optionalString(envelope.input.currency);
  const dueDateInput = envelope.input.dueDate;
  if (dueDateInput !== undefined && typeof dueDateInput !== "string") throw new Error("dueDate must be a string.");
  const dueDate = dueDateInput ? new Date(dueDateInput) : undefined;
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new Error("dueDate must be a valid date.");

  // CRITICAL side effect — its failure is the handler's failure.
  const outcome = await createNewPayment({
    organizationId: envelope.executionContext.organizationId,
    customerId,
    title,
    amount,
    currency,
    dueDate,
    idempotencyKey: envelope.idempotencyKey,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "payment", entityId: outcome.payment.id },
    resultSummary: outcome.created ? "Canonical payment created." : "Canonical payment already existed.",
    metadata: { paymentId: outcome.payment.id, duplicate: !outcome.created },
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
