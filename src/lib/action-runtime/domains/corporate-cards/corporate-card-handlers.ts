import { CorporateCardStatus, PaymentMethod } from "@prisma/client";
import { closeCardStatement, createNewCorporateCard, openCardStatement, payCardStatement, reverseCardStatementPayment, updateCorporateCardStatus } from "@/lib/core/corporate-cards/corporate-card.service";
import type { ActionHandler } from "../../execution";

export const corporateCardCreateHandler: ActionHandler = async (envelope) => {
  const card = await createNewCorporateCard({
    organizationId: envelope.executionContext.organizationId,
    cardholderMemberId: requiredString(envelope.input.cardholderMemberId, "cardholderMemberId"),
    bankName: optionalString(envelope.input.bankName),
    last4: optionalString(envelope.input.last4),
    label: requiredString(envelope.input.label, "label"),
    currency: optionalString(envelope.input.currency),
    actorId: envelope.executionContext.actorId,
  });
  return success("corporate_card", card.id, "corporateCard.create completed.", { status: card.status });
};

export const corporateCardUpdateStatusHandler: ActionHandler = async (envelope) => {
  const corporateCardId = requiredString(envelope.input.corporateCardId, "corporateCardId");
  const status = requiredCardStatus(envelope.input.status);
  const card = await updateCorporateCardStatus({ organizationId: envelope.executionContext.organizationId, corporateCardId, status, actorId: envelope.executionContext.actorId });
  if (!card) return { status: "FAILURE", errorMessage: "CorporateCard not found." };
  return success("corporate_card", corporateCardId, "corporateCard.updateStatus completed.", { status: card.status });
};

export const cardStatementOpenHandler: ActionHandler = async (envelope) => {
  const statement = await openCardStatement({
    organizationId: envelope.executionContext.organizationId,
    corporateCardId: requiredString(envelope.input.corporateCardId, "corporateCardId"),
    periodStart: requiredDate(envelope.input.periodStart, "periodStart"),
    periodEnd: requiredDate(envelope.input.periodEnd, "periodEnd"),
    dueDate: requiredDate(envelope.input.dueDate, "dueDate"),
    actorId: envelope.executionContext.actorId,
  });
  return success("card_statement", statement.id, "cardStatement.open completed.", { status: statement.status });
};

export const cardStatementCloseHandler: ActionHandler = async (envelope) => {
  const cardStatementId = requiredString(envelope.input.cardStatementId, "cardStatementId");
  const outcome = await closeCardStatement({ organizationId: envelope.executionContext.organizationId, cardStatementId, actorId: envelope.executionContext.actorId });
  return success("card_statement", cardStatementId, "cardStatement.close completed.", {
    status: outcome.cardStatement.status,
    totalAmount: outcome.cardStatement.totalAmount?.toString() ?? null,
    assignedExpenseCount: outcome.assignedExpenseCount,
    replayed: outcome.replayed,
  });
};

export const cardStatementPayHandler: ActionHandler = async (envelope) => {
  const cardStatementId = requiredString(envelope.input.cardStatementId, "cardStatementId");
  const outcome = await payCardStatement({
    organizationId: envelope.executionContext.organizationId,
    cardStatementId,
    amount: requiredNumber(envelope.input.amount, "amount"),
    paymentMethod: requiredPaymentMethod(envelope.input.paymentMethod),
    financialAccountReference: requiredString(envelope.input.financialAccountReference, "financialAccountReference"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    idempotencyKey: optionalString(envelope.input.idempotencyKey),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "CardStatement was not found in this organization." };
  return success("card_statement", cardStatementId, "cardStatement.pay completed.", {
    status: outcome.cardStatement.status,
    paymentId: outcome.payment.id,
    movementId: outcome.movement.id,
    replayed: outcome.replayed,
  });
};

export const cardStatementPaymentReverseHandler: ActionHandler = async (envelope) => {
  const cardStatementPaymentId = requiredString(envelope.input.cardStatementPaymentId, "cardStatementPaymentId");
  const outcome = await reverseCardStatementPayment({
    organizationId: envelope.executionContext.organizationId,
    cardStatementPaymentId,
    reason: requiredString(envelope.input.reason, "reason"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "CardStatementPayment was not found in this organization." };
  return success("card_statement", outcome.cardStatement.id, "cardStatement.payment.reverse completed.", {
    status: outcome.cardStatement.status,
    reversalPaymentId: outcome.payment.id,
    movementId: outcome.movement.id,
  });
};

function success(entityType: string, entityId: string, resultSummary: string, metadata: Record<string, unknown>) {
  return { status: "SUCCESS" as const, entityRef: { entityType, entityId }, resultSummary, metadata, domainEvents: [], sideEffects: [] };
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number.`);
  return value;
}
function requiredDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
}
function optionalDate(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("occurredAt must be a string.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("occurredAt must be a valid date.");
  return date;
}
function requiredPaymentMethod(value: unknown): PaymentMethod {
  if (typeof value !== "string" || !Object.values(PaymentMethod).includes(value as PaymentMethod)) {
    throw new Error("paymentMethod must be one of " + Object.values(PaymentMethod).join(", ") + ".");
  }
  return value as PaymentMethod;
}
function requiredCardStatus(value: unknown): CorporateCardStatus {
  if (typeof value !== "string" || !Object.values(CorporateCardStatus).includes(value as CorporateCardStatus)) {
    throw new Error("status must be one of " + Object.values(CorporateCardStatus).join(", ") + ".");
  }
  return value as CorporateCardStatus;
}
