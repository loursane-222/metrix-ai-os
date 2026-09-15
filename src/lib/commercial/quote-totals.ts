// Pure money math for Quote line items and the quote grand total. No I/O,
// no Prisma — the action layer calls this instead of recomputing totals ad
// hoc, so there is exactly one place that defines what "the total" means.
// Ported from the legacy METRIX commercial kernel's quote-totals.ts; the
// formulas are unchanged (see tests/commercial/quote-totals.test.ts, ported
// from the legacy quote-totals.test.ts).

export type QuoteLineInput = {
  quantity: number;
  unitPriceCents: bigint;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
};

const BASIS_POINTS_SCALE = BigInt(10_000);
const ZERO = BigInt(0);

/** Net-of-line-discount, pre-VAT amount for one line, in cents. */
export function computeLineNetCents(
  line: Pick<
    QuoteLineInput,
    "quantity" | "unitPriceCents" | "discountBasisPoints"
  >
): bigint {
  const quantityMicros = BigInt(
    Math.round(line.quantity * 1_000_000)
  );

  const gross =
    (line.unitPriceCents * quantityMicros) /
    BigInt(1_000_000);

  return (
    (gross *
      (BASIS_POINTS_SCALE -
        BigInt(line.discountBasisPoints))) /
    BASIS_POINTS_SCALE
  );
}

/** Net-of-line-discount, VAT-inclusive total for one line, in cents. */
export function computeLineTotalCents(
  line: QuoteLineInput
): bigint {
  const afterDiscount = computeLineNetCents(line);

  const afterVat =
    (afterDiscount *
      (BASIS_POINTS_SCALE +
        BigInt(line.vatRateBasisPoints))) /
    BASIS_POINTS_SCALE;

  return afterVat;
}

/** Grand total across all lines after the quote-level general discount, in cents. */
export function computeQuoteTotalCents(
  lineTotalsCents: readonly bigint[],
  generalDiscountBasisPoints: number | null
): bigint {
  const sum = lineTotalsCents.reduce(
    (acc, cents) => acc + cents,
    ZERO
  );

  if (!generalDiscountBasisPoints) {
    return sum;
  }

  return (
    (sum *
      (BASIS_POINTS_SCALE -
        BigInt(generalDiscountBasisPoints))) /
    BASIS_POINTS_SCALE
  );
}

/** Converts a cents BigInt into the Decimal(14,2)-compatible number Quote.amount stores. */
export function centsToAmount(cents: bigint): number {
  return Number(cents) / 100;
}

/**
 * Converts a Decimal(14,2)-compatible currency amount (e.g. a Payment/
 * Settlement amount already validated by isValidTwoDecimalAmount) into an
 * exact cents BigInt. Inverse of centsToAmount.
 */
export function amountToCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

/** True if amount is finite and expressible with at most 2 decimal places. */
export function isValidTwoDecimalAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) {
    return false;
  }

  const scaled = amount * 100;

  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}
