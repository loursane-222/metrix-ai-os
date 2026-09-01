import { computeActualCashPosition } from "./cash-position.service";
import { computeActualCashFlow } from "./cash-flow.service";
import { resolveManagementPeriod } from "@/lib/management-period";

export type CashPositionDataset = Awaited<ReturnType<typeof computeActualCashPosition>>;
export type CashFlowCurrency = Readonly<{ currency: string; inflow: number; outflow: number; net: number }>;
export type CashFlowDataset = Readonly<{ period: ReturnType<typeof resolveManagementPeriod>; currencies: readonly CashFlowCurrency[]; accounts: Readonly<Awaited<ReturnType<typeof computeActualCashFlow>>["byAccount"]>; categories: Readonly<Awaited<ReturnType<typeof computeActualCashFlow>>["byCategory"]> }>;

export function buildCashPositionDataset(organizationId: string, asOf?: Date) { return computeActualCashPosition(organizationId, asOf); }

export async function buildCashFlowDataset(organizationId: string, input: { periodKind: "CURRENT_MONTH" | "PREVIOUS_MONTH"; now: Date; timeZone: string }): Promise<CashFlowDataset> {
  const period = resolveManagementPeriod({ kind: input.periodKind, now: input.now, timeZone: input.timeZone });
  const flow = await computeActualCashFlow(organizationId, period.start, period.end);
  const currencies = [...new Set(flow.byAccount.map((row) => row.currency))].sort().map((currency) => {
    const rows = flow.byAccount.filter((row) => row.currency === currency);
    const inflow = rows.reduce((sum, row) => sum + row.inflow, 0);
    const outflow = rows.reduce((sum, row) => sum + row.outflow, 0);
    return Object.freeze({ currency, inflow, outflow, net: inflow - outflow });
  });
  return Object.freeze({ period, currencies: Object.freeze(currencies), accounts: Object.freeze(flow.byAccount), categories: Object.freeze(flow.byCategory) });
}
