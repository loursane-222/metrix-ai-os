import { beforeEach, describe, expect, it, vi } from "vitest";

const projections = vi.hoisted(() => vi.fn());
const allocations = vi.hoisted(() => vi.fn());
vi.mock("@/lib/core/calendar/calendar-financial-projection.service", () => ({ computeFinancialObligationProjections: projections }));
vi.mock("@/lib/core/financial-instruments/financial-instrument.repository", () => ({ sumNetAllocationsForObligation: allocations }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { buildCurrentReceivableDataset } from "../current-receivable-intelligence.service";
import { buildCurrentReceivableResponse, projectCurrentReceivableTurnFact } from "../current-receivable-turn";

const now = new Date("2026-09-01T09:00:00.000Z");
const row = (id: string, day: string, amount: number, currency = "TRY", customerName = "Atlas") => ({ id: `obligation:${id}`, title: id, dueDate: `${day}T09:00:00.000Z`, kind: "Tahsilat", status: "OVERDUE" as const, amount, originalAmount: amount, currency, direction: "RECEIVABLE" as const, customerId: customerName === "?" ? null : customerName, customerName: customerName === "?" ? null : customerName, currentStatus: "PARTIAL" });

describe("current receivable intelligence", () => {
  beforeEach(() => { allocations.mockReset().mockResolvedValue(0); projections.mockReset(); });

  it("uses local calendar boundaries, reconciles aging, windows, customers and currencies", async () => {
    projections.mockResolvedValue([
      row("future", "2026-09-02", 40_000), row("today", "2026-09-01", 10_000), row("d30", "2026-08-02", 20_000), row("d31", "2026-08-01", 15_000), row("d60", "2026-07-03", 10_000), row("d61", "2026-07-02", 8_000), row("d90", "2026-06-03", 5_000), row("d91", "2026-06-02", 2_000, "TRY", "?"), row("usd", "2026-08-31", 100, "USD", "Delta"),
    ]);
    const result = await buildCurrentReceivableDataset("org", { now, timeZone: "Europe/Istanbul" });
    const lira = result.currencies.find((item) => item.currency === "TRY")!;
    expect(lira.totalOutstanding).toBe(110_000);
    expect(lira.notYetDue + lira.dueToday + lira.aging.OVERDUE_1_30 + lira.aging.OVERDUE_31_60 + lira.aging.OVERDUE_61_90 + lira.aging.OVERDUE_90_PLUS).toBe(lira.totalOutstanding);
    expect(lira.overdueOutstanding).toBe(lira.aging.OVERDUE_1_30 + lira.aging.OVERDUE_31_60 + lira.aging.OVERDUE_61_90 + lira.aging.OVERDUE_90_PLUS);
    expect(lira.dueNext7Days).toBe(40_000);
    expect(lira.items.find((item) => item.id.endsWith("d30"))?.agingBucket).toBe("OVERDUE_1_30");
    expect(lira.items.find((item) => item.id.endsWith("d31"))?.agingBucket).toBe("OVERDUE_31_60");
    expect(lira.items.find((item) => item.id.endsWith("d90"))?.agingBucket).toBe("OVERDUE_61_90");
    expect(lira.items.find((item) => item.id.endsWith("d91"))?.agingBucket).toBe("OVERDUE_90_PLUS");
    expect(lira.customers.some((customer) => customer.customerName === "Müşterisi belirtilmemiş")).toBe(true);
    expect(result.currencies.find((item) => item.currency === "USD")?.totalOutstanding).toBe(100);
  });

  it("uses canonical projection remaining and deducts active instrument coverage", async () => {
    projections.mockResolvedValue([row("partial", "2026-08-31", 60_000), row("paid", "2026-08-31", 0)]);
    allocations.mockImplementation(async (id: string) => id === "partial" ? 10_000 : 0);
    const result = await buildCurrentReceivableDataset("org", { now, timeZone: "Europe/Istanbul" });
    expect(result.currencies[0].totalOutstanding).toBe(50_000);
    expect(result.currencies[0].obligationCount).toBe(1);
  });

  it("represents known zero and unsupported historical/DSO truth deterministically", () => {
    const empty = { asOf: now.toISOString(), timeZone: "Europe/Istanbul", today: "2026-09-01", currencies: [] } as const;
    expect(buildCurrentReceivableResponse(projectCurrentReceivableTurnFact({ intent: "RECEIVABLE_POSITION", queryMode: "TOTAL" }, empty)!)).toContain("açık alacak bulunmuyor");
    expect(buildCurrentReceivableResponse(projectCurrentReceivableTurnFact({ intent: "RECEIVABLE_POSITION", queryMode: "HISTORICAL_UNSUPPORTED" }, null)!)).toContain("tarihsel snapshot");
    expect(buildCurrentReceivableResponse(projectCurrentReceivableTurnFact({ intent: "RECEIVABLE_POSITION", queryMode: "DSO_UNSUPPORTED" }, null)!)).toContain("DSO");
  });

  it.each([
    ["TOTAL", "açık alacak"], ["OVERDUE", "vadesi geçmiş"], ["DUE_TODAY", "bugün vadesi"],
    ["DUE_NEXT_7_DAYS", "7 takvim"], ["DUE_NEXT_14_DAYS", "14 takvim"], ["DUE_NEXT_30_DAYS", "30 takvim"],
    ["AGING", "1–30 gün"], ["OVERDUE_90_PLUS", "90 günden uzun"], ["LARGEST_OVERDUE", "Atlas"], ["CUSTOMER_OVERDUE_RANKING", "en eski"],
  ] as const)("answers %s from one canonical dataset", async (queryMode, expected) => {
    projections.mockResolvedValue([row("overdue", "2026-08-01", 60_000), row("future", "2026-09-02", 40_000)]);
    const dataset = await buildCurrentReceivableDataset("org", { now, timeZone: "Europe/Istanbul" });
    const fact = projectCurrentReceivableTurnFact({ intent: "RECEIVABLE_POSITION", queryMode }, dataset)!;
    expect(buildCurrentReceivableResponse(fact)).toContain(expected);
  });
});
