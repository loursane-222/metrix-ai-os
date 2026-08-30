import { ApiValidationError } from "@/lib/api/validation";

export const AMOUNT_EPSILON = 0.005;

export function assertPositiveAmount(amount: number): void {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiValidationError("amount must be a positive number.", 400);
  }
}

/**
 * §Core semantic invariant: "received cheque ≠ collection into CASH/BANK",
 * "issued cheque ≠ immediate CASH/BANK outflow" — a RECEIVED instrument can
 * only ever close a RECEIVABLE obligation (money owed TO us); an ISSUED
 * instrument can only ever close a PAYABLE obligation (money WE owe). This
 * is enforced structurally, not left to caller discipline.
 */
export function assertDirectionMatchesObligation(instrumentDirection: "RECEIVED" | "ISSUED", obligationDirection: "RECEIVABLE" | "PAYABLE"): void {
  if (instrumentDirection === "RECEIVED" && obligationDirection !== "RECEIVABLE") {
    throw new ApiValidationError("a received instrument can only be applied to a receivable obligation.", 409);
  }
  if (instrumentDirection === "ISSUED" && obligationDirection !== "PAYABLE") {
    throw new ApiValidationError("an issued instrument can only be applied to a payable obligation.", 409);
  }
}

export function assertAllocatableInstrumentStatus(status: string): void {
  if (status !== "REGISTERED" && status !== "ALLOCATED") {
    throw new ApiValidationError(`instrument in status ${status} cannot be allocated to an obligation.`, 409);
  }
}

export function assertClearableInstrumentStatus(status: string): void {
  if (status !== "REGISTERED" && status !== "ALLOCATED") {
    throw new ApiValidationError(`instrument in status ${status} cannot be cleared.`, 409);
  }
}

export function assertBounceableInstrumentStatus(status: string): void {
  if (status !== "ALLOCATED" && status !== "REGISTERED") {
    throw new ApiValidationError(`instrument in status ${status} cannot be marked bounced — an already CLEARED instrument represents real settled cash and must be reversed via the underlying Settlement/SupplierPayment/ExpenseSettlement instead.`, 409);
  }
}

export function assertCancellableInstrumentStatus(status: string): void {
  if (status !== "REGISTERED") {
    throw new ApiValidationError(`instrument in status ${status} cannot be cancelled — it has already been applied to an obligation or settled/bounced; use bounce or reverse its allocations first.`, 409);
  }
}
