import { PaymentMethod } from "@prisma/client";
import { ApiValidationError } from "@/lib/api/validation";
import { computeRequestHash } from "@/lib/core/shared/idempotency";
import type { CreateLoanInstallmentInput } from "./loan.types";

export const AMOUNT_EPSILON = 0.005;

const SUPPORTED_SETTLEMENT_METHODS: readonly PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER];

export function assertSupportedSettlementMethod(method: PaymentMethod): void {
  if (!SUPPORTED_SETTLEMENT_METHODS.includes(method)) {
    throw new ApiValidationError(`${method} is not a real cash/bank settlement rail for a loan drawdown/repayment.`, 422);
  }
}

export function assertPositiveAmount(amount: number, field = "amount"): void {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError(`${field} must be a positive number.`, 400);
  }
}

export function assertNonNegativeAmount(amount: number, field: string): void {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new ApiValidationError(`${field} must not be negative.`, 400);
  }
}

export function assertNonEmpty(value: string | undefined | null, field: string): void {
  if (typeof value !== "string" || !value.trim()) throw new ApiValidationError(`${field} is required.`, 400);
}

/**
 * §Belirsiz ekonomik anlam uydurulmaz — amortizasyon otomatik hesaplanmaz;
 * her installment'ın principal/interest'i çağıranın (kredi sözleşmesinin
 * kendisi) açık girdisidir. Burada yalnız iç tutarlılık doğrulanır:
 * installment.principalAmount toplamı loan.principalAmount'a eşit olmalı.
 */
export function assertValidInstallmentSchedule(installments: CreateLoanInstallmentInput[], loanPrincipalAmount: number): void {
  if (installments.length === 0) throw new ApiValidationError("at least one installment is required.", 400);
  let principalSum = 0;
  installments.forEach((installment, index) => {
    assertPositiveAmount(installment.principalAmount, `installments[${index}].principalAmount`);
    if (installment.interestAmount !== undefined) assertNonNegativeAmount(installment.interestAmount, `installments[${index}].interestAmount`);
    if (Number.isNaN(installment.dueDate?.getTime?.())) throw new ApiValidationError(`installments[${index}].dueDate must be a valid date.`, 400);
    principalSum += installment.principalAmount;
  });
  if (Math.abs(principalSum - loanPrincipalAmount) > AMOUNT_EPSILON) {
    throw new ApiValidationError("the sum of installments[].principalAmount must equal the loan's principalAmount.", 400);
  }
}

export function computeLoanDrawdownRequestHash(input: { loanId: string; amount: number; paymentMethod: PaymentMethod; financialAccountId: string; occurredAt: Date | undefined }): string {
  return computeRequestHash({ loanId: input.loanId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: input.financialAccountId, occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null });
}

export function computeLoanRepaymentRequestHash(input: { loanInstallmentId: string; amount: number; paymentMethod: PaymentMethod; financialAccountId: string; occurredAt: Date | undefined }): string {
  return computeRequestHash({ loanInstallmentId: input.loanInstallmentId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: input.financialAccountId, occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null });
}

/** §Interest/fees ≠ Principal — principalPortion + interestPortion her zaman amount'a eşit olmalı. */
export function assertPortionsMatchAmount(amount: number, principalPortion: number, interestPortion: number): void {
  if (Math.abs(principalPortion + interestPortion - amount) > AMOUNT_EPSILON) {
    throw new ApiValidationError("principalPortion + interestPortion must equal amount.", 400);
  }
}

export function assertActiveLoanStatus(status: string): void {
  if (status === "CANCELLED") throw new ApiValidationError("a cancelled loan cannot be drawn against.", 409);
}
