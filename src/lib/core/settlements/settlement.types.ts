import type { Application, FinancialAccountMovement, Payment, PaymentMethod, Settlement } from "@prisma/client";

export type ApplySettlementInput = {
  organizationId: string;
  paymentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  referenceNumber?: string;
  externalReference?: string;
  actorId: string;
};

export type ApplySettlementOutcome = {
  payment: Payment;
  settlement: Settlement;
  application: Application;
  movement: FinancialAccountMovement;
  replayed: boolean;
};

export type ReverseSettlementInput = {
  organizationId: string;
  settlementId: string;
  reason: string;
  actorId: string;
  occurredAt?: Date;
};

export type ReverseSettlementOutcome = {
  payment: Payment;
  settlement: Settlement;
  application: Application;
  movement: FinancialAccountMovement;
};
