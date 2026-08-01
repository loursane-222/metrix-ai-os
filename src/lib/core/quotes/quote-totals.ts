// Pure money math for Offer line items and the quote grand total. No I/O,
// no Prisma — every persistence layer (repository, action-runtime handlers)
// calls this instead of recomputing totals ad hoc, so there is exactly one
// place that defines what "the total" means.

export type QuoteLineInput = {
  quantity: number;
  unitPriceCents: bigint;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
};

const BASIS_POINTS_SCALE = BigInt(10_000);
const ZERO = BigInt(0);

/** Net-of-line-discount, VAT-inclusive total for one line, in cents. */
export function computeLineTotalCents(line: QuoteLineInput): bigint {
  const quantityMicros = BigInt(Math.round(line.quantity * 1_000_000));
  const gross = (line.unitPriceCents * quantityMicros) / BigInt(1_000_000);
  const afterDiscount = (gross * (BASIS_POINTS_SCALE - BigInt(line.discountBasisPoints))) / BASIS_POINTS_SCALE;
  const afterVat = (afterDiscount * (BASIS_POINTS_SCALE + BigInt(line.vatRateBasisPoints))) / BASIS_POINTS_SCALE;
  return afterVat;
}

/** Grand total across all lines after the quote-level general discount, in cents. */
export function computeQuoteTotalCents(lineTotalsCents: readonly bigint[], generalDiscountBasisPoints: number | null): bigint {
  const sum = lineTotalsCents.reduce((acc, cents) => acc + cents, ZERO);
  if (!generalDiscountBasisPoints) return sum;
  return (sum * (BASIS_POINTS_SCALE - BigInt(generalDiscountBasisPoints))) / BASIS_POINTS_SCALE;
}

/** Converts a cents BigInt into the Decimal(14,2)-compatible number Quote.amount stores. */
export function centsToAmount(cents: bigint): number {
  return Number(cents) / 100;
}
