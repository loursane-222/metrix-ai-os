import { ApiValidationError } from "@/lib/api/validation";

const AMOUNT_EPSILON = 0.005;

export function assertNonEmpty(value: string | undefined | null, field: string): void {
  if (typeof value !== "string" || !value.trim()) throw new ApiValidationError(`${field} is required.`, 400);
}

export function assertPositiveAmount(amount: number, field = "amount"): void {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError(`${field} must be a positive number.`, 400);
  }
}

/**
 * amount her zaman gider toplamıdır (bkz. şema yorumu). netAmount/taxAmount
 * ikisi birden verildiğinde amount'a eşit olmalıdır — tutarsız bir kırılım
 * sessizce kabul edilmez.
 */
export function assertNetTaxMatchesTotal(input: { amount: number; netAmount?: number; taxAmount?: number }): void {
  if (input.netAmount === undefined && input.taxAmount === undefined) return;
  if (input.netAmount === undefined || input.taxAmount === undefined) {
    throw new ApiValidationError("netAmount and taxAmount must be provided together.", 400);
  }
  if (Math.abs(input.netAmount + input.taxAmount - input.amount) > AMOUNT_EPSILON) {
    throw new ApiValidationError("netAmount + taxAmount must equal amount.", 400);
  }
}

export { AMOUNT_EPSILON };
