// Single canonical authority for the Payment -> Settlement -> Application ->
// outstanding balance formula (Task 17). No I/O, no Prisma — every caller
// (collection-record action, invoice-receivable-lookup, collection-lookup)
// computes outstanding through this module so there is exactly one place
// that defines what "outstanding" means. LLM never performs this arithmetic.

import { amountToCents } from "./quote-totals";

export type CollectionState = "UNPAID" | "PARTIAL" | "PAID";

export type ApplicationLedgerRow = {
  amount: unknown;
  kind: "ORIGINAL" | "REVERSAL";
};

const ZERO = BigInt(0);

/**
 * netCollected = SUM(Application ORIGINAL) - SUM(Application REVERSAL).
 * Task 17 only ever creates ORIGINAL rows, but the formula is written in
 * the future-compatible net form so a later REVERSAL capability needs no
 * change here.
 */
export function computeNetCollectedCents(
  applications: readonly ApplicationLedgerRow[]
): bigint {
  return applications.reduce((net, application) => {
    const cents = amountToCents(Number(application.amount));

    return application.kind === "REVERSAL"
      ? net - cents
      : net + cents;
  }, ZERO);
}

export function computeOutstandingCents(
  paymentAmountCents: bigint,
  netCollectedCents: bigint
): bigint {
  return paymentAmountCents - netCollectedCents;
}

export function deriveCollectionState(
  netCollectedCents: bigint,
  outstandingCents: bigint
): CollectionState {
  if (netCollectedCents <= ZERO) {
    return "UNPAID";
  }

  if (outstandingCents <= ZERO) {
    return "PAID";
  }

  return "PARTIAL";
}
