import { OrganizationRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { domainEvidenceRepository as repository } from "../domain-evidence.repository";
import { readCanonicalDomainEvidence } from "../domain-evidence.service";

const now = new Date("2026-08-08T00:00:00.000Z");

describe("customer visibility in conversation domain evidence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(repository, "organization").mockResolvedValue(null);
    vi.spyOn(repository, "customers").mockResolvedValue([{ id: "customer-1", status: "ACTIVE", currency: "TRY", balanceCents: BigInt(9000), healthScore: 88, tier: "VIP", source: "MANUAL", updatedAt: now }]);
    vi.spyOn(repository, "customerContacts").mockResolvedValue([]);
    vi.spyOn(repository, "customerCommercialTerms").mockResolvedValue([{ id: "terms-1", customerId: "customer-1", paymentTermDays: 30, creditLimitCents: BigInt(500000), defaultCurrency: "TRY", deliveryTerm: null, updatedAt: now }]);
    for (const name of ["products", "quotes", "payments", "collections", "goals", "tasks", "executiveActions", "executiveDecisions", "executiveOutcomes", "verifiedCompanyMemories"] as const) vi.spyOn(repository, name).mockResolvedValue([]);
  });

  it("does not put credit, balance, health or tier into EMPLOYEE conversation context", async () => {
    const adapters = await readCanonicalDomainEvidence("org-1", OrganizationRole.EMPLOYEE);
    const customer = adapters.find((item) => item.sourceDomain === "customers")!;
    const terms = adapters.find((item) => item.sourceDomain === "customer_terms")!;
    expect(customer.evidence[0]?.summary).toBe("status=ACTIVE; currency=TRY");
    expect(terms.evidence).toEqual([]);
    expect(repository.customerCommercialTerms).not.toHaveBeenCalled();
  });

  it("keeps complete customer and commercial evidence for OWNER", async () => {
    const adapters = await readCanonicalDomainEvidence("org-1", OrganizationRole.OWNER);
    const customer = adapters.find((item) => item.sourceDomain === "customers")!;
    const terms = adapters.find((item) => item.sourceDomain === "customer_terms")!;
    expect(customer.evidence[0]?.summary).toContain("balanceCents=9000");
    expect(customer.evidence[0]?.summary).toContain("health=88");
    expect(customer.evidence[0]?.summary).toContain("tier=VIP");
    expect(terms.evidence[0]?.summary).toContain("creditLimitCents=500000");
  });
});
