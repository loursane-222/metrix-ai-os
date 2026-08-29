import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { businessCandidate: { findMany: findManyMock } },
}));

import {
  customerNameRawFromChanges,
  findPendingRepRequestCandidates,
  repRequestDomainForTargetDomain,
  repRequestDomainLabel,
  targetDomainForRepRequestDomain,
} from "../rep-request.repository";

describe("targetDomainForRepRequestDomain / repRequestDomainForTargetDomain", () => {
  it("round-trips ORDER/QUOTE/PAYMENT through Order/Quote/Payment", () => {
    expect(targetDomainForRepRequestDomain("ORDER")).toBe("Order");
    expect(targetDomainForRepRequestDomain("QUOTE")).toBe("Quote");
    expect(targetDomainForRepRequestDomain("PAYMENT")).toBe("Payment");
    expect(repRequestDomainForTargetDomain("Order")).toBe("ORDER");
    expect(repRequestDomainForTargetDomain("Quote")).toBe("QUOTE");
    expect(repRequestDomainForTargetDomain("Payment")).toBe("PAYMENT");
  });

  it("returns null for an unrelated targetDomain", () => {
    expect(repRequestDomainForTargetDomain("CustomFieldDefinition")).toBeNull();
  });
});

describe("repRequestDomainLabel", () => {
  it("labels each domain in Turkish", () => {
    expect(repRequestDomainLabel("ORDER")).toBe("Sipariş");
    expect(repRequestDomainLabel("QUOTE")).toBe("Teklif");
    expect(repRequestDomainLabel("PAYMENT")).toBe("Tahsilat");
  });
});

describe("customerNameRawFromChanges", () => {
  it("reads the customerNameRaw change value", () => {
    const value = customerNameRawFromChanges([{ fieldPath: "customerId", proposedValue: "c1" }, { fieldPath: "customerNameRaw", proposedValue: "Atlas İnşaat" }]);
    expect(value).toBe("Atlas İnşaat");
  });

  it("returns null when no customerNameRaw change exists", () => {
    expect(customerNameRawFromChanges([{ fieldPath: "customerId", proposedValue: "c1" }])).toBeNull();
  });
});

describe("findPendingRepRequestCandidates", () => {
  beforeEach(() => findManyMock.mockReset());

  it("queries PENDING_APPROVAL Order/Quote/Payment candidates for the org", async () => {
    findManyMock.mockResolvedValue([]);
    await findPendingRepRequestCandidates("org-1", "user-1");
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1", status: "PENDING_APPROVAL", targetDomain: { in: ["Order", "Quote", "Payment"] } },
    }));
  });

  it("filters in application code to only this proposer's candidates", async () => {
    findManyMock.mockResolvedValue([
      { id: "c1", provenanceJson: { proposedByUserId: "user-1" } },
      { id: "c2", provenanceJson: { proposedByUserId: "user-2" } },
      { id: "c3", provenanceJson: null },
    ]);
    const result = await findPendingRepRequestCandidates("org-1", "user-1");
    expect(result.map((item) => item.id)).toEqual(["c1"]);
  });
});
