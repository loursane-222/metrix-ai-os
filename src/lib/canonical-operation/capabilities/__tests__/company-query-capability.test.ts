import { describe, expect, it, vi, beforeEach } from "vitest";

const { executeCompanyQueryPlanMock } = vi.hoisted(() => ({ executeCompanyQueryPlanMock: vi.fn() }));
vi.mock("@/lib/company-query-authority", () => ({ executeCompanyQueryPlan: executeCompanyQueryPlanMock }));

import { getCapability, resetCapabilityRegistryForTests } from "../../capability-registry";
import { registerCompanyQueryCapability } from "../company-query-capability";

describe("company.query capability", () => {
  beforeEach(() => {
    resetCapabilityRegistryForTests();
    registerCompanyQueryCapability();
    executeCompanyQueryPlanMock.mockReset();
  });

  it("delegates to the real executeCompanyQueryPlan with the nested plan/now/timeZone/conversationId", async () => {
    executeCompanyQueryPlanMock.mockResolvedValue({ scope: "single_customer", customer: { id: "cust-1" } });
    const capability = getCapability("company.query")!;
    expect(capability.implementation.kind).toBe("READ");
    if (capability.implementation.kind !== "READ") return;

    const plan = { scope: "single_customer", customerReference: "Atlas", facts: ["RECEIVABLE_POSITION"], judgmentNeed: false };
    const result = await capability.implementation.search!("org-1", {
      plan, now: "2026-01-01T00:00:00.000Z", timeZone: "Europe/Istanbul", conversationId: "conv-1",
    });

    expect(executeCompanyQueryPlanMock).toHaveBeenCalledWith(
      "org-1",
      plan,
      expect.objectContaining({ timeZone: "Europe/Istanbul", conversationId: "conv-1" }),
    );
    expect((executeCompanyQueryPlanMock.mock.calls[0]![2] as { now: Date }).now).toBeInstanceOf(Date);
    expect(result).toEqual({ scope: "single_customer", customer: { id: "cust-1" } });
  });

  it("defaults timeZone/conversationId when the caller omits them, never throwing", async () => {
    executeCompanyQueryPlanMock.mockResolvedValue({ scope: "domain_count", domain: "customer", count: 3 });
    const capability = getCapability("company.query")!;
    if (capability.implementation.kind !== "READ") return;
    await capability.implementation.search!("org-1", { plan: { scope: "domain_count", domain: "customer" } });
    expect(executeCompanyQueryPlanMock).toHaveBeenCalledWith("org-1", { scope: "domain_count", domain: "customer" }, expect.any(Object));
  });
});
