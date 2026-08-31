import { ApiValidationError } from "@/lib/api/validation";
import type { StructuredPaymentTerm } from "@/lib/payment-terms";

/**
 * Bir Invoice'ın paymentTermSnapshot'ı yoksa (bugünün en yaygın durumu),
 * onun mevcut düz dueDate'inden tek bileşenli, triviyal bir Structured
 * Payment Term sentezler — materializePaymentTerm'i HER invoice için
 * (yapılandırılmış terimi olsun olmasın) tek, tutarlı bir yoldan geçirmek
 * için. dueDate yoksa IMMEDIATE (invoice'un kendi tarihinde vadeye girer).
 */
export function trivialTermFromDueDate(dueDate: Date | null): StructuredPaymentTerm {
  if (!dueDate) {
    return { schemaVersion: 1, strategy: "SCHEDULE", components: [{ allocationType: "REMAINDER", maturityBasis: "IMMEDIATE" }] };
  }
  return {
    schemaVersion: 1,
    strategy: "SCHEDULE",
    components: [{ allocationType: "REMAINDER", maturityBasis: "FIXED_DATE", dueDate: dueDate.toISOString().slice(0, 10) }],
  };
}

export function assertMaterializableInvoiceStatus(status: string): void {
  if (status === "DRAFT" || status === "CANCELLED") {
    throw new ApiValidationError(`a ${status} invoice has no real commercial obligation to materialize yet.`, 409);
  }
}

export function assertMaterializableExpenseStatus(status: string): void {
  if (status === "CANCELLED") {
    throw new ApiValidationError("a cancelled expense has no obligation to materialize.", 409);
  }
}

export function assertMaterializablePurchaseInvoiceStatus(status: string): void {
  if (status === "DRAFT" || status === "CANCELLED") {
    throw new ApiValidationError(`a ${status} purchase invoice has no real commercial obligation to materialize yet.`, 409);
  }
}

/**
 * Phase 11 — bir CardStatement yalnız CLOSED olduktan sonra materialize
 * edilebilir: OPEN iken totalAmount henüz kesinleşmemiştir (döneme hangi
 * giderlerin dahil olacağı hâlâ değişebilir) — "Belirsiz ekonomik anlam
 * uydurulmaz" kuralı gereği kesinleşmemiş bir tutar üzerinden obligation
 * yaratılmaz.
 */
export function assertMaterializableCardStatementStatus(status: string): void {
  if (status !== "CLOSED" && status !== "PARTIALLY_PAID" && status !== "PAID") {
    throw new ApiValidationError(`a ${status} card statement has no finalized obligation to materialize yet.`, 409);
  }
}
