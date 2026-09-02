import { describe, expect, it, vi } from "vitest";
import type { ManagementIntent } from "@/lib/conversation-understanding";
import { buildCurrentQuotePipelineDataset, buildCurrentQuotePipelinePromptLine, buildCurrentQuotePipelineResponse } from "../quote-pipeline";

type Intent = Extract<ManagementIntent, { intent: "QUOTE_PIPELINE" }>;
const intent = (queryMode: Intent["queryMode"]): Intent => ({ intent: "QUOTE_PIPELINE", queryMode });
const rows = [
  { id: "try-big", title: "Atlas", status: "SENT" as const, amount: { toString: () => "100000.50" }, currency: "TRY", customerId: "c1", customer: { id: "c1", displayName: "Atlas A.Ş." } },
  { id: "try-null", title: "Tutarsız", status: "VIEWED" as const, amount: null, currency: "TRY", customerId: null, customer: null },
  { id: "usd", title: "Export", status: "NEGOTIATION" as const, amount: "5000", currency: "USD", customerId: "c2", customer: { id: "c2", displayName: "Export Ltd." } },
];
const reader = (value = rows) => ({ quote: { findMany: vi.fn().mockResolvedValue(value) } });

describe("current canonical quote pipeline", () => {
  it("queries only externally open statuses with tenant isolation and no presentation cap", async () => {
    const db = reader();
    await buildCurrentQuotePipelineDataset("org-1", intent("SUMMARY"), db);
    expect(db.quote.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: { in: ["SENT", "VIEWED", "NEGOTIATION"] } }, select: { id: true, title: true, status: true, amount: true, currency: true, customerId: true, customer: { select: { id: true, displayName: true } } } });
    expect(JSON.stringify(db.quote.findMany.mock.calls)).not.toMatch(/DRAFT|WON|LOST|CANCELLED|take|createdAt|updatedAt/iu);
  });

  it("keeps current values and largest ranking separate by currency while preserving unknown amounts", async () => {
    const dataset = await buildCurrentQuotePipelineDataset("org-1", intent("LARGEST_OPEN"), reader());
    expect(dataset.openQuoteCount).toBe(3);
    expect(dataset.currencies).toEqual([
      expect.objectContaining({ currency: "TRY", quoteCount: 2, knownValue: 100000.5, unknownAmountCount: 1 }),
      expect.objectContaining({ currency: "USD", quoteCount: 1, knownValue: 5000, unknownAmountCount: 0 }),
    ]);
    const response = buildCurrentQuotePipelineResponse(dataset);
    expect(response).toContain("TRY:"); expect(response).toContain("USD:"); expect(response).toContain("1 teklifin tutarı belirtilmemiş");
    expect(response).not.toContain("105.000");
  });

  it("aggregates canonical customer relations and preserves unattributed quotes", async () => {
    const dataset = await buildCurrentQuotePipelineDataset("org-1", intent("CUSTOMER_DISTRIBUTION"), reader());
    expect(dataset.customers.map((row) => [row.customerId, row.customerName, row.quoteCount])).toEqual([["c1", "Atlas A.Ş.", 1], ["c2", "Export Ltd.", 1], [null, "Müşterisi belirtilmemiş", 1]]);
    expect(buildCurrentQuotePipelineResponse(dataset)).toContain("Müşterisi belirtilmemiş");
  });

  it("reports affirmative zero and remains deterministic", async () => {
    const build = () => buildCurrentQuotePipelineDataset("org-zero", intent("SUMMARY"), reader([]));
    const first = await build(); const second = await build();
    expect(first).toEqual(second);
    expect(buildCurrentQuotePipelineResponse(first)).toBe("Şu anda açık teklif bulunmuyor.");
    expect(buildCurrentQuotePipelinePromptLine(first)).toContain("not sales/revenue/forecast/orders/collections/cash");
  });
});
