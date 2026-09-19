import { describe, expect, it } from "vitest";

import {
  calculateProfitMargin,
  calculateComparableProfit,
  canActivateAfterOtp
} from "../../src/lib/platform/access-policy";

describe("platform controlled-access policy", () => {
  it("does not activate unknown email addresses after OTP verification", () => {
    expect(canActivateAfterOtp({ existingUser: false, acceptedInvite: false })).toBe(false);
    expect(canActivateAfterOtp({ existingUser: true, acceptedInvite: false })).toBe(true);
    expect(canActivateAfterOtp({ existingUser: false, acceptedInvite: true })).toBe(true);
  });

  it("calculates profit margin from actual revenue and safely handles zero revenue", () => {
    expect(calculateProfitMargin(10_000n, 2_500n)).toBe(75);
    expect(calculateProfitMargin(0n, 0n)).toBeNull();
  });

  it("refuses a profit calculation when revenue and measured usage use different currencies", () => {
    expect(calculateComparableProfit(10_000n, "TRY", 2_500n, "USD")).toBeNull();
    expect(calculateComparableProfit(10_000n, "USD", 2_500n, "USD")).toEqual({ profitCents: 7_500n, currency: "USD", marginPercent: 75 });
  });
});
