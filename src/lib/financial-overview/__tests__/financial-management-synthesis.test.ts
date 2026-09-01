import { describe, expect, it } from "vitest";
import type { CashFlowDataset, CashPositionDataset } from "@/lib/core/reporting/cash-management-intelligence.service";
import type { CurrentPayableDataset } from "@/lib/core/reporting/current-payable-intelligence.service";
import type { CurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import type { CollectionPerformanceTurnFact } from "@/lib/domain-evidence/collection-performance-turn";
import { evaluateFinancialAttention } from "@/lib/financial-attention/financial-attention.policy";
import { buildFinancialManagementSynthesis, buildFinancialManagementSynthesisResponse } from "../financial-management-synthesis";

const aging = (overdue = 0, over90 = 0) => ({ NOT_YET_DUE: 0, DUE_TODAY: 0, OVERDUE_1_30: overdue - over90, OVERDUE_31_60: 0, OVERDUE_61_90: 0, OVERDUE_90_PLUS: over90 });
const receivables = (rows: readonly [string, number, number, number][] = []): CurrentReceivableDataset => ({ asOf: "2026-09-02T09:00:00.000Z", timeZone: "Europe/Istanbul", today: "2026-09-02", currencies: rows.map(([currency, total, overdue, over90]) => ({ currency, totalOutstanding: total, overdueOutstanding: overdue, dueToday: 0, notYetDue: total - overdue, dueNext7Days: 0, dueNext14Days: 0, dueNext30Days: 0, obligationCount: total ? 1 : 0, overdueObligationCount: overdue ? 1 : 0, aging: aging(overdue, over90), items: [], customers: [] })) });
const payables = (rows: readonly [string, number, number, number][] = []): CurrentPayableDataset => ({ asOf: "2026-09-02T09:00:00.000Z", timeZone: "Europe/Istanbul", today: "2026-09-02", currencies: rows.map(([currency, total, overdue, over90]) => ({ currency, totalOutstanding: total, overdueOutstanding: overdue, dueToday: 0, notYetDue: total - overdue, dueNext7Days: 0, dueNext14Days: 0, dueNext30Days: 0, obligationCount: total ? 1 : 0, overdueObligationCount: overdue ? 1 : 0, aging: aging(overdue, over90), items: [], counterparties: [] })) });
const cash = (rows: readonly [string, number][] | null): CashPositionDataset => ({ asOf: "2026-09-02T09:00:00.000Z", accounts: rows?.map(([currency, balance]) => ({ financialAccountId: currency, name: currency, type: "BANK", currency, balance })) ?? [], totalsByCurrency: rows?.map(([currency, amount]) => ({ currency, amount })) ?? [] });
const flow = (rows: readonly [string, number, number][] = []): CashFlowDataset => ({ period: { kind: "CURRENT_MONTH", label: "Eylül 2026", start: new Date("2026-08-31T21:00:00.000Z"), end: new Date("2026-09-02T09:00:00.000Z"), timeZone: "Europe/Istanbul" }, currencies: rows.map(([currency, inflow, outflow]) => ({ currency, inflow, outflow, net: inflow - outflow })), accounts: [], categories: [] });
const collections = (rows: readonly [string, number, number][] = []): CollectionPerformanceTurnFact => ({ intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH", label: "Eylül 2026", start: "2026-08-31T21:00:00.000Z", endExclusive: "2026-09-02T09:00:00.000Z", timeZone: "Europe/Istanbul", eventCount: rows.length, currencies: rows.map(([currency, netCollections, reversals]) => ({ currency, grossCollections: netCollections - reversals, reversals, netCollections, eventCount: 1 })) });

function synth(input: { collections?: CollectionPerformanceTurnFact; receivables?: CurrentReceivableDataset; payables?: CurrentPayableDataset; cashPosition?: CashPositionDataset; cashFlow?: CashFlowDataset } = {}) {
  const canonical = { collections: input.collections ?? collections(), receivables: input.receivables ?? receivables(), payables: input.payables ?? payables(), cashPosition: input.cashPosition ?? cash([["TRY", 0]]), cashFlow: input.cashFlow ?? flow() };
  const attention = evaluateFinancialAttention({ receivables: canonical.receivables, payables: canonical.payables, cashPosition: canonical.cashPosition, currentCollections: canonical.collections });
  return buildFinancialManagementSynthesis({ ...canonical, attention });
}

describe("FinancialManagementSynthesis", () => {
  it("preserves known zero separately from unavailable cash", () => {
    const known = buildFinancialManagementSynthesisResponse(synth());
    expect(known).toMatch(/tahsilat hareketi bulunmuyor[\s\S]*açık alacak bulunmuyor[\s\S]*Gerçek nakit pozisyonu 0 TRY[\s\S]*açık borç bulunmuyor/);
    const unavailable = buildFinancialManagementSynthesisResponse(synth({ cashPosition: cash(null) }));
    expect(unavailable).toContain("gerçek nakit pozisyonunu değerlendiremiyorum");
    expect(unavailable).not.toContain("Gerçek nakit pozisyonu 0");
  });

  it.each([
    ["receivable", { receivables: receivables([["TRY", 30_000, 10_000, 0]]) }, "açık alacak 30.000 TRY"],
    ["payable", { payables: payables([["TRY", 20_000, 5_000, 0]]) }, "açık borç 20.000 TRY"],
    ["cash", { cashPosition: cash([["TRY", 65_000]]) }, "Gerçek nakit pozisyonu 65.000 TRY"],
    ["collection", { collections: collections([["TRY", 40_000, 0]]) }, "net tahsilat 40.000 TRY"],
  ] as const)("synthesizes the canonical %s dimension without new arithmetic", (_name, input, expected) => {
    expect(buildFinancialManagementSynthesisResponse(synth(input))).toContain(expected);
  });

  it("keeps collection, cash flow, current state and currencies semantically separate", () => {
    const dataset = synth({ collections: collections([["TRY", 40_000, -2_000], ["USD", 1_000, 0]]), receivables: receivables([["TRY", 30_000, 15_000, 15_000], ["USD", 500, 0, 0]]), payables: payables([["EUR", 20_000, 10_000, 10_000]]), cashPosition: cash([["TRY", 65_000], ["USD", 2_000]]), cashFlow: flow([["TRY", 70_000, 25_000]]) });
    expect(dataset.currenciesPresent).toEqual(["EUR", "TRY", "USD"]);
    const response = buildFinancialManagementSynthesisResponse(dataset);
    expect(response).toMatch(/40\.000 TRY ve 1\.000 USD/);
    expect(response).toContain("TRY: 70.000 giriş, 25.000 çıkış, net 45.000");
    expect(response).not.toMatch(/finansal durum.*(?:iyi|kötü|sağlıklı)|likidite|risk düşük|net finansal pozisyon/iu);
  });

  it("surfaces attention facts once and keeps deterministic ordering/narration", () => {
    const input = { collections: collections([["TRY", 4_000, -1_000]]), receivables: receivables([["TRY", 20_000, 15_000, 5_000]]), payables: payables([["TRY", 8_000, 3_000, 3_000]]), cashPosition: cash(null) };
    const first = buildFinancialManagementSynthesisResponse(synth(input));
    const second = buildFinancialManagementSynthesisResponse(synth(input));
    expect(second).toBe(first);
    expect(first.match(/90 günden uzun süredir gecikmiş 5\.000 TRY açık alacak/g)).toHaveLength(1);
    expect(first.match(/90 günden uzun süredir gecikmiş 3\.000 TRY açık borç/g)).toHaveLength(1);
    expect(first.match(/1\.000 TRY tahsilat ters kaydı/g)).toHaveLength(1);
    expect(first.endsWith("gerçek nakit pozisyonunu değerlendiremiyorum.")).toBe(true);
  });
});
