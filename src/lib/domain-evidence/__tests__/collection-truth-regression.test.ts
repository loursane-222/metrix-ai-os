import { OrganizationRole, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const buildCollectionsDataset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/artifacts/datasets/collections-dataset.service", () => ({ buildCollectionsDataset }));

import { domainEvidenceRepository as repository } from "../domain-evidence.repository";
import { readCanonicalDomainEvidence } from "../domain-evidence.service";

const observedAt = new Date("2026-09-15T09:00:00.000Z");

describe("live management collection truth boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const name of ["products", "quotes", "collections", "goals", "tasks", "executiveActions", "executiveDecisions", "executiveOutcomes", "verifiedCompanyMemories", "customers", "customerContacts", "customerCommercialTerms"] as const) {
      vi.spyOn(repository, name).mockResolvedValue([]);
    }
    vi.spyOn(repository, "organization").mockResolvedValue(null);
  });

  it("publishes Settlement-derived September net collections while retaining Payment current state only", async () => {
    vi.spyOn(repository, "payments").mockResolvedValue([{
      id: "payment-1", title: "Cumulative rollup", status: "PARTIAL", amount: new Prisma.Decimal(20_000),
      currency: "TRY", dueDate: new Date("2026-09-30T00:00:00.000Z"), updatedAt: observedAt,
    }]);
    buildCollectionsDataset.mockResolvedValue({
      period: { from: new Date("2026-08-31T21:00:00.000Z"), to: observedAt, label: "Eylül 2026", isoLabel: "2026-09" },
      records: [{ occurredAt: new Date("2026-09-05T09:00:00.000Z"), customerName: "A", title: "September", amount: 6_000, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" }],
      recordCount: 1, totalsByCurrency: { TRY: 6_000 },
    });

    const adapters = await readCanonicalDomainEvidence("org-1", OrganizationRole.OWNER, { now: observedAt, timeZone: "Europe/Istanbul" });
    const payment = adapters.find((item) => item.sourceDomain === "payments")!.evidence[0]!;
    const collections = adapters.find((item) => item.sourceDomain === "collection_events")!.evidence[0]!;

    expect(payment.summary).toContain("status=PARTIAL");
    expect(payment.summary).not.toMatch(/paidAmount|paidAt|paid=/u);
    expect(payment.projection).toEqual(expect.objectContaining({ status: "PARTIAL", amount: 20_000, currency: "TRY" }));
    expect(payment.projection).not.toHaveProperty("paidAmount");
    expect(collections).toMatchObject({ evidenceType: "COLLECTION_PERIOD_SUMMARY", managementCategory: "finance" });
    expect(collections.projection).toEqual(expect.objectContaining({ netCollections: 6_000, currency: "TRY", periodKind: "CURRENT_MONTH" }));
    expect(buildCollectionsDataset).toHaveBeenCalledWith("org-1", expect.objectContaining({
      from: new Date("2026-08-31T21:00:00.000Z"), to: observedAt,
    }));
  });

  it("proves August ORIGINAL 5,000 and REVERSAL 1,000 net to 4,000 rather than a 10,000 Payment rollup", async () => {
    const augustNow = new Date("2026-08-20T09:00:00.000Z");
    vi.spyOn(repository, "payments").mockResolvedValue([{
      id: "payment-1", title: "Rollup 10k", status: "PARTIAL", amount: new Prisma.Decimal(10_000),
      currency: "TRY", dueDate: null, updatedAt: observedAt,
    }]);
    buildCollectionsDataset.mockResolvedValue({
      period: { from: new Date("2026-07-31T21:00:00.000Z"), to: augustNow, label: "Ağustos 2026", isoLabel: "2026-08" },
      records: [
        { occurredAt: new Date("2026-08-05T09:00:00Z"), customerName: "A", title: "Original", amount: 5_000, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" },
        { occurredAt: new Date("2026-08-15T09:00:00Z"), customerName: "A", title: "Reversal", amount: -1_000, currency: "TRY", invoiceNumber: null, kind: "REVERSAL" },
      ],
      recordCount: 2, totalsByCurrency: { TRY: 4_000 },
    });

    const adapters = await readCanonicalDomainEvidence("org-1", OrganizationRole.OWNER, { now: augustNow, timeZone: "Europe/Istanbul" });
    const collections = adapters.find((item) => item.sourceDomain === "collection_events")!.evidence[0]!;
    expect(collections.projection).toEqual(expect.objectContaining({ grossCollections: 5_000, reversals: -1_000, netCollections: 4_000 }));
    expect(collections.summary).not.toContain("10000");
  });

  it("preserves legitimate Payment obligation statuses as current-state evidence", async () => {
    vi.spyOn(repository, "payments").mockResolvedValue(["PENDING", "PARTIAL", "OVERDUE", "PAID"].map((status, index) => ({
      id: `payment-${index}`, title: status, status: status as "PENDING" | "PARTIAL" | "OVERDUE" | "PAID",
      amount: new Prisma.Decimal(1_000), currency: "TRY", dueDate: null, updatedAt: observedAt,
    })));
    buildCollectionsDataset.mockResolvedValue({
      period: { from: new Date("2026-08-31T21:00:00.000Z"), to: observedAt, label: "Eylül 2026", isoLabel: "2026-09" },
      records: [], recordCount: 0, totalsByCurrency: {},
    });

    const adapters = await readCanonicalDomainEvidence("org-1", OrganizationRole.OWNER, { now: observedAt, timeZone: "Europe/Istanbul" });
    const payments = adapters.find((item) => item.sourceDomain === "payments")!.evidence;
    expect(payments.map((item) => item.projection?.status)).toEqual(["PENDING", "PARTIAL", "OVERDUE", "PAID"]);
    const collectionEvents = adapters.find((item) => item.sourceDomain === "collection_events")!;
    expect(collectionEvents.domainState).toBe("AVAILABLE");
    expect(collectionEvents.evidence[0]?.projection).toMatchObject({ periodKind: "CURRENT_MONTH", eventCount: 0, currencies: [], currency: null });
  });

  it("resolves explicit previous-month collection performance through the E1 period resolver", async () => {
    vi.spyOn(repository, "payments").mockResolvedValue([]);
    buildCollectionsDataset.mockResolvedValue({
      period: { from: new Date("2026-07-31T21:00:00.000Z"), to: new Date("2026-08-31T21:00:00.000Z"), label: "Ağustos 2026", isoLabel: "2026-08" },
      records: [], recordCount: 0, totalsByCurrency: {},
    });
    const adapters = await readCanonicalDomainEvidence("org-1", OrganizationRole.OWNER, {
      now: new Date("2026-09-01T09:00:00.000Z"), timeZone: "Europe/Istanbul", periodKind: "PREVIOUS_MONTH",
    });
    const collection = adapters.find((item) => item.sourceDomain === "collection_events")!.evidence[0]!;
    expect(collection.projection).toMatchObject({
      periodKind: "PREVIOUS_MONTH", periodLabel: "Ağustos 2026",
      periodStart: "2026-07-31T21:00:00.000Z", periodEndExclusive: "2026-08-31T21:00:00.000Z", eventCount: 0,
    });
    expect(buildCollectionsDataset).toHaveBeenCalledWith("org-1", expect.objectContaining({
      from: new Date("2026-07-31T21:00:00.000Z"), to: new Date("2026-08-31T21:00:00.000Z"), label: "Ağustos 2026",
    }));
  });

  it("loads both comparison periods from Settlement summaries without using Payment rollups", async () => {
    vi.spyOn(repository, "payments").mockResolvedValue([{
      id: "payment-rollup", title: "Conflicting Payment", status: "PAID", amount: new Prisma.Decimal(99_000),
      currency: "TRY", dueDate: null, updatedAt: observedAt,
    }]);
    buildCollectionsDataset.mockImplementation(async (_organizationId, period) => period.label === "Eylül 2026"
      ? {
          period, records: [{ occurredAt: observedAt, customerName: "A", title: "Current", amount: 5_000, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" }],
          recordCount: 1, totalsByCurrency: { TRY: 5_000 },
        }
      : {
          period, records: [
            { occurredAt: new Date("2026-08-05T09:00:00Z"), customerName: "A", title: "Previous", amount: 8_000, currency: "TRY", invoiceNumber: null, kind: "ORIGINAL" },
            { occurredAt: new Date("2026-08-10T09:00:00Z"), customerName: "A", title: "Reversal", amount: -1_000, currency: "TRY", invoiceNumber: null, kind: "REVERSAL" },
          ], recordCount: 2, totalsByCurrency: { TRY: 7_000 },
        });

    const adapters = await readCanonicalDomainEvidence("org-1", OrganizationRole.OWNER, {
      now: observedAt, timeZone: "Europe/Istanbul", periodKinds: ["CURRENT_MONTH", "PREVIOUS_MONTH"],
    });
    const evidence = adapters.find((item) => item.sourceDomain === "collection_events")!.evidence;
    expect(evidence.map((item) => item.projection)).toEqual(expect.arrayContaining([
      expect.objectContaining({ periodKind: "CURRENT_MONTH", netCollections: 5_000 }),
      expect.objectContaining({ periodKind: "PREVIOUS_MONTH", grossCollections: 8_000, reversals: -1_000, netCollections: 7_000 }),
    ]));
    expect(JSON.stringify(evidence)).not.toContain("99000");
  });
});
