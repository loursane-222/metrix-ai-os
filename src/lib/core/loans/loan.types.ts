import type { FinancialAccountMovement, Loan, LoanDrawdown, LoanInstallment, LoanRepayment, PaymentMethod } from "@prisma/client";

export type CreateLoanInstallmentInput = {
  dueDate: Date;
  principalAmount: number;
  interestAmount?: number;
};

export type CreateLoanInput = {
  organizationId: string;
  lenderName: string;
  principalAmount: number;
  currency?: string;
  interestRate?: number;
  startDate: Date;
  note?: string;
  installments: CreateLoanInstallmentInput[];
  actorId: string;
};

export type CreateLoanOutcome = {
  loan: Loan;
  installments: LoanInstallment[];
};

export type DrawLoanInput = {
  organizationId: string;
  loanId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type DrawLoanOutcome = {
  loan: Loan;
  drawdown: LoanDrawdown;
  movement: FinancialAccountMovement;
  replayed: boolean;
};

export type ReverseLoanDrawdownInput = {
  organizationId: string;
  loanDrawdownId: string;
  reason: string;
  occurredAt?: Date;
  actorId: string;
};

export type ReverseLoanDrawdownOutcome = {
  drawdown: LoanDrawdown;
  movement: FinancialAccountMovement;
};

export type RepayLoanInstallmentInput = {
  organizationId: string;
  loanInstallmentId: string;
  amount: number;
  principalPortion: number;
  interestPortion?: number;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  idempotencyKey?: string;
  actorId: string;
};

export type RepayLoanInstallmentOutcome = {
  repayment: LoanRepayment;
  movement: FinancialAccountMovement;
  replayed: boolean;
};

export type ReverseLoanRepaymentInput = {
  organizationId: string;
  loanRepaymentId: string;
  reason: string;
  occurredAt?: Date;
  actorId: string;
};

export type ReverseLoanRepaymentOutcome = {
  repayment: LoanRepayment;
  movement: FinancialAccountMovement;
};

export type { FinancialAccountMovement, Loan, LoanDrawdown, LoanInstallment, LoanRepayment };
