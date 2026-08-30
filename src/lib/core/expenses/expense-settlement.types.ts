import type { Expense, ExpenseSettlement, FinancialAccountMovement, PaymentMethod } from "@prisma/client";

export type SettleExpenseInput = {
  organizationId: string;
  expenseId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type SettleExpenseOutcome = {
  expense: Expense;
  settlement: ExpenseSettlement;
  movement: FinancialAccountMovement;
  replayed: boolean;
};

export type ReverseExpenseSettlementInput = {
  organizationId: string;
  expenseSettlementId: string;
  reason: string;
  actorId: string;
  occurredAt?: Date;
};

export type ReverseExpenseSettlementOutcome = {
  expense: Expense;
  settlement: ExpenseSettlement;
  movement: FinancialAccountMovement;
};
