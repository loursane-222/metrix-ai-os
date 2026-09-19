export function canActivateAfterOtp(input: {
  existingUser: boolean;
  acceptedInvite: boolean;
}): boolean {
  return input.existingUser || input.acceptedInvite;
}

/** Revenue is the denominator: (revenue - measurable cost) / revenue. */
export function calculateProfitMargin(
  revenueCents: bigint,
  measurableCostCents: bigint
): number | null {
  if (revenueCents <= 0n) return null;
  return Number(((revenueCents - measurableCostCents) * 10_000n) / revenueCents) / 100;
}

/** Never subtract different currencies without an explicitly-approved FX rate. */
export function calculateComparableProfit(
  revenueCents: bigint,
  revenueCurrency: string | null,
  costCents: bigint,
  costCurrency: string | null
): { profitCents: bigint; currency: string; marginPercent: number | null } | null {
  if (!revenueCurrency || !costCurrency || revenueCurrency !== costCurrency) return null;
  const profitCents = revenueCents - costCents;
  return { profitCents, currency: revenueCurrency, marginPercent: calculateProfitMargin(revenueCents, costCents) };
}
