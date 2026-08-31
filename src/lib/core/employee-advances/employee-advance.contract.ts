import { PaymentMethod } from "@prisma/client";
import { ApiValidationError } from "@/lib/api/validation";
import { computeRequestHash } from "@/lib/core/shared/idempotency";

export const AMOUNT_EPSILON = 0.005;

const SUPPORTED_SETTLEMENT_METHODS: readonly PaymentMethod[] = [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER];

export function assertSupportedSettlementMethod(method: PaymentMethod): void {
  if (!SUPPORTED_SETTLEMENT_METHODS.includes(method)) {
    throw new ApiValidationError(`${method} is not a real cash/bank settlement rail for an employee advance movement.`, 422);
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

export function computeAdvanceMovementRequestHash(input: { employeeAdvanceId: string; direction: string; amount: number; paymentMethod: PaymentMethod; financialAccountId: string; occurredAt: Date | undefined }): string {
  return computeRequestHash({
    employeeAdvanceId: input.employeeAdvanceId,
    direction: input.direction,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    financialAccountId: input.financialAccountId,
    occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null,
  });
}

export function assertActiveAdvanceStatus(status: string): void {
  if (status === "CANCELLED") throw new ApiValidationError("a cancelled employee advance cannot be moved or reconciled.", 409);
}
