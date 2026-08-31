import type { EmployeeAdvance, EmployeeAdvanceMovement, EmployeeAdvanceReconciliation, Expense, FinancialAccountMovement, MoneyDirection, PaymentMethod } from "@prisma/client";

export type CreateEmployeeAdvanceInput = {
  organizationId: string;
  employeeMemberId: string;
  amount: number;
  currency?: string;
  note?: string;
  actorId: string;
};

export type DisburseOrReturnAdvanceInput = {
  organizationId: string;
  employeeAdvanceId: string;
  direction: MoneyDirection;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type DisburseOrReturnAdvanceOutcome = {
  employeeAdvance: EmployeeAdvance;
  movement: EmployeeAdvanceMovement;
  financialAccountMovement: FinancialAccountMovement;
  replayed: boolean;
};

export type ReverseAdvanceMovementInput = {
  organizationId: string;
  employeeAdvanceMovementId: string;
  reason: string;
  occurredAt?: Date;
  actorId: string;
};

export type ReverseAdvanceMovementOutcome = {
  employeeAdvance: EmployeeAdvance;
  movement: EmployeeAdvanceMovement;
  financialAccountMovement: FinancialAccountMovement;
};

export type ReconcileAdvanceInput = {
  organizationId: string;
  employeeAdvanceId: string;
  expenseId: string;
  amount: number;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type ReconcileAdvanceOutcome = {
  employeeAdvance: EmployeeAdvance;
  reconciliation: EmployeeAdvanceReconciliation;
  replayed: boolean;
};

export type ReverseAdvanceReconciliationInput = {
  organizationId: string;
  employeeAdvanceReconciliationId: string;
  reason: string;
  occurredAt?: Date;
  actorId: string;
};

export type ReverseAdvanceReconciliationOutcome = {
  employeeAdvance: EmployeeAdvance;
  reconciliation: EmployeeAdvanceReconciliation;
};

export type { EmployeeAdvance, EmployeeAdvanceMovement, EmployeeAdvanceReconciliation, Expense, FinancialAccountMovement };
