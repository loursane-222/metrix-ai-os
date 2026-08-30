import { PaymentMethod } from "@prisma/client";
import { ApiValidationError } from "@/lib/api/validation";
import { computeRequestHash } from "@/lib/core/shared/idempotency";

export const AMOUNT_EPSILON = 0.005;

/**
 * settlement.contract.ts / expense-settlement.contract.ts ile aynı sınır —
 * CREDIT_CARD/CHEQUE/PROMISSORY_NOTE/OTHER enstrüman ömrü otoritesi Phase 10.
 */
const SUPPORTED_SETTLEMENT_METHODS: readonly PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER];

export function assertSupportedSettlementMethod(method: PaymentMethod): void {
  if (!SUPPORTED_SETTLEMENT_METHODS.includes(method)) {
    throw new ApiValidationError(
      `${method} tedarikçi ödemeleri için gerçek para hareketi olarak kaydedilemez; enstrüman ömrü otoritesi henüz yok (Phase 10).`,
      422,
    );
  }
}

export function assertPositiveAmount(amount: number): void {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError("amount must be a positive number.", 400);
  }
}

/**
 * computeSettlementRequestHash/computeExpenseSettlementRequestHash ile aynı
 * kritik kural: hash SADECE çağıranın verdiği alanlardan üretilir.
 */
export function computeSupplierPaymentRequestHash(input: { purchaseInvoiceId: string; amount: number; paymentMethod: PaymentMethod; financialAccountId: string; occurredAt: Date | undefined }): string {
  return computeRequestHash({
    purchaseInvoiceId: input.purchaseInvoiceId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    financialAccountId: input.financialAccountId,
    occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null,
  });
}
