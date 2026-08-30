import { PaymentMethod } from "@prisma/client";
import { ApiValidationError } from "@/lib/api/validation";
import { computeRequestHash } from "@/lib/core/shared/idempotency";

export const AMOUNT_EPSILON = 0.005;

/**
 * Phase 3 only wires real-time cash and bank-transfer settlement.
 * CREDIT_CARD/CHEQUE/PROMISSORY_NOTE/OTHER need instrument lifecycle
 * authority (clearing, statement cycles) that ships in Phase 10 — until
 * then they fail closed here, before ever reaching the FinancialAccount
 * resolver, with a message specific to what's missing rather than reusing
 * Phase 2's generic "no direct financial-account settlement contract" one.
 */
const SUPPORTED_SETTLEMENT_METHODS: readonly PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER];

export function assertSupportedSettlementMethod(method: PaymentMethod): void {
  if (!SUPPORTED_SETTLEMENT_METHODS.includes(method)) {
    throw new ApiValidationError(
      `${method} tahsilatları gerçek para hareketi olarak kaydedilemez; enstrüman ömrü otoritesi henüz yok (Phase 10).`,
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
 * Bir Settlement bugün her zaman tam olarak bir Application üretir (1:1),
 * ama şema Phase 8'in bir Settlement'ı birden fazla obligation'a bölmesine
 * izin verecek şekilde bire-çok kurulu. Bu guard o gelecekteki genişlemeyi
 * güvenli kılan zorunlu invariant'ı bugünden kodlar: bir Settlement'a bağlı
 * Application'ların toplamı, Settlement'ın kendi tutarını asla aşamaz.
 */
export function assertApplicationWithinSettlement(applicationAmount: number, settlementAmount: number): void {
  if (applicationAmount > settlementAmount + AMOUNT_EPSILON) {
    throw new ApiValidationError("application amount exceeds its settlement amount.", 500);
  }
}

/**
 * Settlement idempotency replay authority'nin tek doğruluk kaynağı. Hash,
 * SADECE çağıranın gerçekten verdiği alanlardan üretilir — sunucu tarafında
 * varsayılan (örn. occurredAt verilmediğinde new Date()) DEĞİL. Aksi halde
 * occurredAt vermeyen iki çağrı (orijinal + replay) iki farklı Date.now()
 * anına düşer, hash hiçbir zaman eşleşmez ve replay her seferinde sahte
 * "409 farklı istek" ile başarısız olur — replay authority'yi işlevsiz kılar.
 */
export function computeSettlementRequestHash(input: { paymentId: string; amount: number; paymentMethod: PaymentMethod; financialAccountId: string; occurredAt: Date | undefined }): string {
  return computeRequestHash({
    paymentId: input.paymentId,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    financialAccountId: input.financialAccountId,
    occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null,
  });
}
