import { describe, expect, it } from "vitest";

import {
  centsToAmount,
  computeLineNetCents,
  computeLineTotalCents,
  computeQuoteTotalCents
} from "../../src/lib/commercial/quote-totals";

describe(
  "quote-totals — canonical line/total money math",
  () => {
    const line = {
      quantity: 2,
      unitPriceCents: BigInt(1000),
      discountBasisPoints: 1000,
      vatRateBasisPoints: 2000
    };

    it(
      "computeLineNetCents returns the post-discount, pre-VAT amount",
      () => {
        expect(
          computeLineNetCents(line)
        ).toBe(BigInt(1800));
      }
    );

    it(
      "computeLineTotalCents applies VAT on top of computeLineNetCents's net",
      () => {
        expect(
          computeLineTotalCents(line)
        ).toBe(BigInt(2160));
      }
    );

    it(
      "computeLineTotalCents with zero discount/vat returns the plain gross",
      () => {
        expect(
          computeLineTotalCents({
            quantity: 3,
            unitPriceCents: BigInt(500),
            discountBasisPoints: 0,
            vatRateBasisPoints: 0
          })
        ).toBe(BigInt(1500));
      }
    );

    it(
      "computeQuoteTotalCents sums line totals with no general discount",
      () => {
        expect(
          computeQuoteTotalCents(
            [BigInt(2160), BigInt(1000)],
            null
          )
        ).toBe(BigInt(3160));
      }
    );

    it(
      "computeQuoteTotalCents applies the general discount on top of the vat-inclusive sum",
      () => {
        expect(
          computeQuoteTotalCents(
            [BigInt(2160), BigInt(1000)],
            1000
          )
        ).toBe(BigInt(2844));
      }
    );

    it(
      "centsToAmount converts to a Decimal(14,2)-compatible number",
      () => {
        expect(
          centsToAmount(BigInt(2160))
        ).toBe(21.6);
      }
    );

    it(
      "computeLineTotalCents handles fractional quantities deterministically",
      () => {
        expect(
          computeLineTotalCents({
            quantity: 2.5,
            unitPriceCents: BigInt(1000),
            discountBasisPoints: 0,
            vatRateBasisPoints: 0
          })
        ).toBe(BigInt(2500));
      }
    );

    it(
      "computeQuoteTotalCents across multiple lines with a quote-level discount",
      () => {
        const lineTotals = [
          computeLineTotalCents({
            quantity: 3,
            unitPriceCents: BigInt(2000),
            discountBasisPoints: 500,
            vatRateBasisPoints: 2000
          }),
          computeLineTotalCents({
            quantity: 1,
            unitPriceCents: BigInt(15000),
            discountBasisPoints: 0,
            vatRateBasisPoints: 1000
          })
        ];

        expect(
          computeQuoteTotalCents(
            lineTotals,
            2500
          )
        ).toBe(BigInt(17505));
      }
    );
  }
);
