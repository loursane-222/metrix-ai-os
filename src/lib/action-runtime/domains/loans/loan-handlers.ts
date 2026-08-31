import { PaymentMethod } from "@prisma/client";
import { createNewLoan, drawLoan, repayLoanInstallment, reverseLoanDrawdown, reverseLoanRepayment } from "@/lib/core/loans/loan.service";
import type { ActionHandler } from "../../execution";

export const loanCreateHandler: ActionHandler = async (envelope) => {
  const installmentsInput = envelope.input.installments;
  if (!Array.isArray(installmentsInput) || installmentsInput.length === 0) throw new Error("installments must be a non-empty array.");
  const installments = installmentsInput.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) throw new Error(`installments[${index}] must be an object.`);
    const item = raw as Record<string, unknown>;
    return {
      dueDate: requiredDate(item.dueDate, `installments[${index}].dueDate`),
      principalAmount: requiredNumber(item.principalAmount, `installments[${index}].principalAmount`),
      interestAmount: item.interestAmount === undefined ? undefined : requiredNumber(item.interestAmount, `installments[${index}].interestAmount`),
    };
  });

  const outcome = await createNewLoan({
    organizationId: envelope.executionContext.organizationId,
    lenderName: requiredString(envelope.input.lenderName, "lenderName"),
    principalAmount: requiredNumber(envelope.input.principalAmount, "principalAmount"),
    currency: optionalString(envelope.input.currency),
    interestRate: envelope.input.interestRate === undefined ? undefined : requiredNumber(envelope.input.interestRate, "interestRate"),
    startDate: requiredDate(envelope.input.startDate, "startDate"),
    note: optionalString(envelope.input.note),
    installments,
    actorId: envelope.executionContext.actorId,
  });
  return success("loan", outcome.loan.id, "loan.create completed.", { status: outcome.loan.status, installmentCount: outcome.installments.length });
};

export const loanDrawHandler: ActionHandler = async (envelope) => {
  const loanId = requiredString(envelope.input.loanId, "loanId");
  const outcome = await drawLoan({
    organizationId: envelope.executionContext.organizationId,
    loanId,
    amount: requiredNumber(envelope.input.amount, "amount"),
    paymentMethod: requiredPaymentMethod(envelope.input.paymentMethod),
    financialAccountReference: requiredString(envelope.input.financialAccountReference, "financialAccountReference"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    idempotencyKey: optionalString(envelope.input.idempotencyKey),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "Loan was not found in this organization." };
  return success("loan", loanId, "loan.draw completed.", { drawdownId: outcome.drawdown.id, movementId: outcome.movement.id, replayed: outcome.replayed });
};

export const loanDrawdownReverseHandler: ActionHandler = async (envelope) => {
  const loanDrawdownId = requiredString(envelope.input.loanDrawdownId, "loanDrawdownId");
  const outcome = await reverseLoanDrawdown({
    organizationId: envelope.executionContext.organizationId,
    loanDrawdownId,
    reason: requiredString(envelope.input.reason, "reason"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "LoanDrawdown was not found in this organization." };
  return success("loan_drawdown", outcome.drawdown.id, "loan.drawdown.reverse completed.", { reversalDrawdownId: outcome.drawdown.id, movementId: outcome.movement.id });
};

export const loanInstallmentRepayHandler: ActionHandler = async (envelope) => {
  const loanInstallmentId = requiredString(envelope.input.loanInstallmentId, "loanInstallmentId");
  const outcome = await repayLoanInstallment({
    organizationId: envelope.executionContext.organizationId,
    loanInstallmentId,
    amount: requiredNumber(envelope.input.amount, "amount"),
    principalPortion: requiredNumber(envelope.input.principalPortion, "principalPortion"),
    interestPortion: envelope.input.interestPortion === undefined ? undefined : requiredNumber(envelope.input.interestPortion, "interestPortion"),
    paymentMethod: requiredPaymentMethod(envelope.input.paymentMethod),
    financialAccountReference: requiredString(envelope.input.financialAccountReference, "financialAccountReference"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    idempotencyKey: optionalString(envelope.input.idempotencyKey),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "LoanInstallment was not found in this organization." };
  return success("loan_installment", loanInstallmentId, "loan.installment.repay completed.", { repaymentId: outcome.repayment.id, movementId: outcome.movement.id, replayed: outcome.replayed });
};

export const loanRepaymentReverseHandler: ActionHandler = async (envelope) => {
  const loanRepaymentId = requiredString(envelope.input.loanRepaymentId, "loanRepaymentId");
  const outcome = await reverseLoanRepayment({
    organizationId: envelope.executionContext.organizationId,
    loanRepaymentId,
    reason: requiredString(envelope.input.reason, "reason"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "LoanRepayment was not found in this organization." };
  return success("loan_repayment", outcome.repayment.id, "loan.repayment.reverse completed.", { reversalRepaymentId: outcome.repayment.id, movementId: outcome.movement.id });
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
