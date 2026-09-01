import { describe, expect, it } from "vitest";
import type { CashPositionDataset } from "@/lib/core/reporting/cash-management-intelligence.service";
import type { CurrentPayableDataset } from "@/lib/core/reporting/current-payable-intelligence.service";
import type { CurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import type { CollectionPerformanceTurnFact } from "@/lib/domain-evidence/collection-performance-turn";
import { buildFinancialAttentionResponse, evaluateFinancialAttention } from "../financial-attention.policy";

const aging = (over90 = 0) => ({ NOT_YET_DUE: 0, DUE_TODAY: 0, OVERDUE_1_30: 0, OVERDUE_31_60: 0, OVERDUE_61_90: 0, OVERDUE_90_PLUS: over90 });
const receivables = (rows: readonly [string, number][] = []): CurrentReceivableDataset => ({ asOf: "2026-09-02T09:00:00.000Z", timeZone: "Europe/Istanbul", today: "2026-09-02", currencies: rows.map(([currency, over90]) => ({ currency, totalOutstanding: over90, overdueOutstanding: over90, dueToday: 0, notYetDue: 0, dueNext7Days: 0, dueNext14Days: 0, dueNext30Days: 0, obligationCount: over90 > 0 ? 1 : 0, overdueObligationCount: over90 > 0 ? 1 : 0, aging: aging(over90), items: [], customers: [] })) });
const payables = (rows: readonly [string, number][] = []): CurrentPayableDataset => ({ asOf: "2026-09-02T09:00:00.000Z", timeZone: "Europe/Istanbul", today: "2026-09-02", currencies: rows.map(([currency, over90]) => ({ currency, totalOutstanding: over90, overdueOutstanding: over90, dueToday: 0, notYetDue: 0, dueNext7Days: 0, dueNext14Days: 0, dueNext30Days: 0, obligationCount: over90 > 0 ? 1 : 0, overdueObligationCount: over90 > 0 ? 1 : 0, aging: aging(over90), items: [], counterparties: [] })) });
const cash = (available = true): CashPositionDataset => ({ asOf: "2026-09-02T09:00:00.000Z", accounts: available ? [{ financialAccountId: "cash", name: "Kasa", type: "CASH", currency: "TRY", balance: 0 }] : [], totalsByCurrency: available ? [{ currency: "TRY", amount: 0 }] : [] });
const collections = (rows: readonly [string, number][] = []): CollectionPerformanceTurnFact => ({ intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH", label: "Eylül 2026", start: "2026-08-31T21:00:00.000Z", endExclusive: "2026-09-02T09:00:00.000Z", timeZone: "Europe/Istanbul", eventCount: rows.length, currencies: rows.map(([currency, reversals]) => ({ currency, grossCollections: 0, reversals, netCollections: reversals, eventCount: 1 })) });

describe("FinancialAttentionPolicy", () => {
  it("returns no attention when every required dimension is evaluated and no rule qualifies", () => {
    const result = evaluateFinancialAttention({ receivables: receivables([["TRY", 0]]), payables: payables([["TRY", 0]]), cashPosition: cash(), currentCollections: collections() });
    expect(result.items).toEqual([]);
    expect(buildFinancialAttentionResponse(result)).toContain("tanımlı kurallara göre dikkat gerektiren bir durum görünmüyor");
  });

  it("distinguishes unavailable cash from known zero and never emits a false all-clear", () => {
    const unavailable = evaluateFinancialAttention({ receivables: receivables(), payables: payables(), cashPosition: cash(false), currentCollections: collections() });
    expect(unavailable.items).toMatchObject([{ kind: "INFORMATION_GAP", reasonCode: "CASH_POSITION_UNAVAILABLE" }]);
    expect(buildFinancialAttentionResponse(unavailable)).toContain("değerlendiremiyorum");
    expect(evaluateFinancialAttention({ receivables: receivables(), payables: payables(), cashPosition: cash(true), currentCollections: collections() }).items).toEqual([]);
  });

  it("uses only canonical 90+ buckets and preserves their 90/91-day boundary", () => {
    const at90 = evaluateFinancialAttention({ receivables: receivables([["TRY", 0]]), payables: payables([["TRY", 0]]), cashPosition: cash(), currentCollections: collections() });
    expect(at90.items).toEqual([]);
    const at91 = evaluateFinancialAttention({ receivables: receivables([["TRY", 120_000]]), payables: payables([["TRY", 80_000]]), cashPosition: cash(), currentCollections: collections() });
    expect(at91.items.map((item) => [item.reasonCode, item.amount])).toEqual([["RECEIVABLE_OVER_90_DAYS", 120_000], ["PAYABLE_OVER_90_DAYS", 80_000]]);
  });

  it("surfaces current-period reversals factually without inventing a cause", () => {
    const result = evaluateFinancialAttention({ receivables: receivables(), payables: payables(), cashPosition: cash(), currentCollections: collections([["TRY", -12_000]]) });
    expect(result.items[0]).toMatchObject({ reasonCode: "COLLECTION_REVERSAL_ACTIVITY", evidenceSource: "COLLECTIONS_MANAGEMENT_SUMMARY", currency: "TRY", amount: 12_000 });
    const response = buildFinancialAttentionResponse(result);
    expect(response).toContain("tahsilat ters kaydı");
    expect(response).not.toMatch(/dolandır|hata|müşteri.*gecik|hemen|ödeyin/iu);
  });

  it("keeps currencies separate and ordering stable across repeated identical evidence", () => {
    const input = { receivables: receivables([["USD", 8_000], ["TRY", 120_000]]), payables: payables([["EUR", 2_000], ["TRY", 35_000]]), cashPosition: cash(false), currentCollections: collections([["USD", -500], ["TRY", -1_000]]) };
    const first = evaluateFinancialAttention(input);
    const second = evaluateFinancialAttention(input);
    expect(second).toEqual(first);
    expect(first.items.map((item) => item.id)).toEqual(["receivable-over-90:TRY", "receivable-over-90:USD", "payable-over-90:EUR", "payable-over-90:TRY", "collection-reversal:TRY", "collection-reversal:USD", "cash-position-unavailable"]);
    expect(buildFinancialAttentionResponse(first)).toMatch(/120\.000 TRY[\s\S]*8\.000 USD[\s\S]*2\.000 EUR/);
  });

  it("does not evaluate target pace, ordinary balances, short overdue, or cash-flow direction", () => {
    const result = evaluateFinancialAttention({ receivables: receivables([["TRY", 0]]), payables: payables([["TRY", 0]]), cashPosition: cash(), currentCollections: collections([["TRY", 0]]) });
    expect(result.items).toEqual([]);
    expect(result.items.some((item) => item.reasonCode.includes("TARGET"))).toBe(false);
  });
});
