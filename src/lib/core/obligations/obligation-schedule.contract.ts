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
