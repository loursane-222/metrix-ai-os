import type { DomainEventDescriptor } from "../../events";

/**
 * Bkz. invoice-domain-events.ts / customer-domain-events.ts — aynı desen.
 * Reversal, tek bir domain event olarak modellenir: orijinal Settlement'ın
 * geri alındığını ve zincirin (Application/Movement/Payment/Ledger/Invoice)
 * bu tek olaya bağlı olarak güncellendiğini taşır. deduplicationKey, aynı
 * reversal'ın outbox'ta iki kez işlenmesini engeller.
 */
export function buildSettlementReversedDomainEvent(input: {
  originalSettlementId: string;
  reversalSettlementId: string;
  applicationId: string;
  movementId: string;
  paymentId: string;
  amount: string;
  currency: string;
  actorId: string;
}): DomainEventDescriptor {
  return {
    eventType: "SettlementReversed",
    aggregateType: "settlement",
    aggregateId: input.reversalSettlementId,
    schemaVersion: "1",
    payload: {
      originalSettlementId: input.originalSettlementId,
      reversalSettlementId: input.reversalSettlementId,
      applicationId: input.applicationId,
      movementId: input.movementId,
      paymentId: input.paymentId,
      amount: input.amount,
      currency: input.currency,
      actorId: input.actorId,
    },
    deduplicationKey: `settlement-reversed:${input.reversalSettlementId}`,
  };
}
