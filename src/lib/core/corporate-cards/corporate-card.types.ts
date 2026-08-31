import type { CardStatement, CardStatementPayment, CorporateCard, CorporateCardStatus, FinancialAccountMovement, PaymentMethod } from "@prisma/client";

export type CreateCorporateCardInput = {
  organizationId: string;
  cardholderMemberId: string;
  bankName?: string;
  last4?: string;
  label: string;
  currency?: string;
  actorId: string;
};

export type UpdateCorporateCardStatusInput = {
  organizationId: string;
  corporateCardId: string;
  status: CorporateCardStatus;
  actorId: string;
};

export type OpenCardStatementInput = {
  organizationId: string;
  corporateCardId: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  actorId: string;
};

export type CloseCardStatementInput = {
  organizationId: string;
  cardStatementId: string;
  actorId: string;
};

export type CloseCardStatementOutcome = {
  cardStatement: CardStatement;
  assignedExpenseCount: number;
  replayed: boolean;
};

export type PayCardStatementInput = {
  organizationId: string;
  cardStatementId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type PayCardStatementOutcome = {
  cardStatement: CardStatement;
  payment: CardStatementPayment;
  movement: FinancialAccountMovement;
  replayed: boolean;
};

export type ReverseCardStatementPaymentInput = {
  organizationId: string;
  cardStatementPaymentId: string;
  reason: string;
  occurredAt?: Date;
  actorId: string;
};

export type ReverseCardStatementPaymentOutcome = {
  cardStatement: CardStatement;
  payment: CardStatementPayment;
  movement: FinancialAccountMovement;
};

export type { CardStatement, CardStatementPayment, CorporateCard, FinancialAccountMovement };
