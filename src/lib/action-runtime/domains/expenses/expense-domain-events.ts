import type { DomainEventDescriptor } from "../../events";

/**
 * Bkz. settlement-domain-events.ts — aynı desen, payable tarafı.
 */
export function buildExpenseSettlementReversedDomainEvent(input: {
  originalExpenseSettlementId: string;
  reversalExpenseSettlementId: string;
  movementId: string;
  expenseId: string;
  amount: string;
  currency: string;
  actorId: string;
}): DomainEventDescriptor {
  return {
    eventType: "ExpenseSettlementReversed",
    aggregateType: "expense_settlement",
    aggregateId: input.reversalExpenseSettlementId,
    schemaVersion: "1",
    payload: {
      originalExpenseSettlementId: input.originalExpenseSettlementId,
      reversalExpenseSettlementId: input.reversalExpenseSettlementId,
      movementId: input.movementId,
      expenseId: input.expenseId,
      amount: input.amount,
      currency: input.currency,
      actorId: input.actorId,
    },
    deduplicationKey: `expense-settlement-reversed:${input.reversalExpenseSettlementId}`,
  };
}
