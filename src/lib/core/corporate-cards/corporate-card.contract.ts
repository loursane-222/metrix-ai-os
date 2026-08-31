import { PaymentMethod } from "@prisma/client";
import { ApiValidationError } from "@/lib/api/validation";
import { computeRequestHash } from "@/lib/core/shared/idempotency";

export const AMOUNT_EPSILON = 0.005;

/**
 * supplier-payment.contract.ts / expense-settlement.contract.ts ile aynı
 * sınır — enstrüman ömrü otoritesi Phase 10, statement ödemesi burada
 * yalnız gerçek CASH/BANK rail'lerini kabul eder.
 */
const SUPPORTED_SETTLEMENT_METHODS: readonly PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER];

export function assertSupportedSettlementMethod(method: PaymentMethod): void {
  if (!SUPPORTED_SETTLEMENT_METHODS.includes(method)) {
    throw new ApiValidationError(`${method} is not a real cash/bank settlement rail for a card statement payment.`, 422);
  }
}

export function assertPositiveAmount(amount: number, field = "amount"): void {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError(`${field} must be a positive number.`, 400);
  }
}

export function assertNonEmpty(value: string | undefined | null, field: string): void {
  if (typeof value !== "string" || !value.trim()) throw new ApiValidationError(`${field} is required.`, 400);
}

export function computeCardStatementPaymentRequestHash(input: { cardStatementId: string; amount: number; paymentMethod: PaymentMethod; financialAccountId: string; occurredAt: Date | undefined }): string {
  return computeRequestHash({
    cardStatementId: input.cardStatementId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    financialAccountId: input.financialAccountId,
    occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null,
  });
}

/**
 * §Core semantic invariant — yalnız CLOSED/PARTIALLY_PAID/OPEN olmayan bir
 * statement ikinci kez kapatılamaz; PAID/CANCELLED artık gerçek bir açık
 * dönem değildir.
 */
export function assertClosableCardStatementStatus(status: string): void {
  if (status !== "OPEN") {
    throw new ApiValidationError(`card statement is already ${status} and cannot be closed again.`, 409);
  }
}

export function assertPayableCardStatementStatus(status: string): void {
  if (status !== "CLOSED" && status !== "PARTIALLY_PAID") {
    throw new ApiValidationError(`a ${status} card statement cannot receive a payment.`, 409);
  }
}
