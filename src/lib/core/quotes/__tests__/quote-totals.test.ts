import { describe, expect, it } from "vitest";
import { centsToAmount, computeLineNetCents, computeLineTotalCents, computeQuoteTotalCents } from "../quote-totals";

describe("quote-totals — shared line/total money math (Quote and, since Phase 7, Invoice)", () => {
  const line = { quantity: 2, unitPriceCents: BigInt(1000), discountBasisPoints: 1000, vatRateBasisPoints: 2000 }; // 2x10.00, 10% discount, 20% VAT

  it("computeLineNetCents returns the post-discount, pre-VAT amount", () => {
    // gross = 2000, after 10% discount = 1800
    expect(computeLineNetCents(line)).toBe(BigInt(1800));
  });

  it("computeLineTotalCents applies VAT on top of computeLineNetCents's net (regression: refactor to share the discount step must not change the result)", () => {
    // net 1800 * 1.20 = 2160
    expect(computeLineTotalCents(line)).toBe(BigInt(2160));
  });

  it("computeLineTotalCents with zero discount/vat returns the plain gross", () => {
    expect(computeLineTotalCents({ quantity: 3, unitPriceCents: BigInt(500), discountBasisPoints: 0, vatRateBasisPoints: 0 })).toBe(BigInt(1500));
  });

  it("computeQuoteTotalCents sums line totals with no general discount", () => {
    expect(computeQuoteTotalCents([BigInt(2160), BigInt(1000)], null)).toBe(BigInt(3160));
  });

  it("computeQuoteTotalCents applies the general discount on top of the vat-inclusive sum", () => {
    // sum 3160, 10% general discount -> 2844
    expect(computeQuoteTotalCents([BigInt(2160), BigInt(1000)], 1000)).toBe(BigInt(2844));
  });

  it("centsToAmount converts to a Decimal(14,2)-compatible number", () => {
    expect(centsToAmount(BigInt(2160))).toBe(21.6);
  });
});
