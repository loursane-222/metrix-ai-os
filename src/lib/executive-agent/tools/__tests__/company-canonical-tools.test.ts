import { describe, expect, it, vi } from "vitest";

/**
 * Authoritative Truth Consolidation, part 3/3 regression: "Müşteri listesini
 * göster" used to get a real, populated Workspace panel while the Executive
 * Agent's own company_query tool had no scope for a plain unfiltered
 * listing (only domain_count/customer_set/single_customer) — the Agent
 * honestly, but unhelpfully, said it had no listing access. company_query
 * now accepts scope "customer_list", proving the capability is present on
 * the Agent's own tool surface (not just narrated as missing).
 */

const mocks = vi.hoisted(() => ({
  executeCompanyQueryPlan: vi.fn(),
  buildCompanyQueryResponse: vi.fn(),
}));

vi.mock("@/lib/company-query-authority", () => ({
  executeCompanyQueryPlan: mocks.executeCompanyQueryPlan,
  buildCompanyQueryResponse: mocks.buildCompanyQueryResponse,
}));
// company-canonical-tools.ts also imports executeCanonicalOperation for its
// sibling company_read/company_write tools (unused by company_query itself,
// but the module-level import still pulls in the real capability registry's
// Prisma-backed read services) — stub Prisma so loading the module doesn't
// require a real DATABASE_URL.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

const { buildCompanyQueryTool } = await import("../company-canonical-tools");

const runContext = {
  organizationId: "org-1",
  actorId: "user-1",
  correlationId: "corr-1",
  channel: "written",
  conversationId: "conv-1",
  timeZone: "Europe/Istanbul",
} as never;

async function invoke(input: Record<string, unknown>): Promise<{ factsText: unknown; result: unknown }> {
  const tool = buildCompanyQueryTool(runContext);
  const result = await tool.invoke({ context: runContext } as never, JSON.stringify(input));
  return result as unknown as { factsText: unknown; result: unknown };
}

describe("company_query — customer_list capability is present on the Agent's own tool surface", () => {
  it("accepts scope customer_list (regression for the 'no listing access' capability gap) and returns the real set", async () => {
    const customers = [
      { id: "c1", displayName: "GC Kabul Müşteri 1", phone: "0555 111 22 33" },
      { id: "c2", displayName: "Test Kabul Ltd.", phone: null },
    ];
    mocks.executeCompanyQueryPlan.mockResolvedValue({ scope: "customer_list", customers });
    mocks.buildCompanyQueryResponse.mockReturnValue("2 aktif müşteri var:\n- GC Kabul Müşteri 1\n- Test Kabul Ltd.");

    const output = await invoke({ plan: { scope: "customer_list" } });

    expect(mocks.executeCompanyQueryPlan).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ scope: "customer_list" }),
      expect.anything(),
    );
    expect(output.factsText).toContain("GC Kabul Müşteri 1");
    expect(output.factsText).toContain("Test Kabul Ltd.");
  });

  it("still forces judgmentNeed to false regardless of what the model supplies — the Agent itself is the only judgment producer", async () => {
    mocks.executeCompanyQueryPlan.mockResolvedValue({ scope: "customer_list", customers: [] });
    mocks.buildCompanyQueryResponse.mockReturnValue("Şirketinizde henüz kayıtlı bir aktif müşteri bulunmuyor.");

    await invoke({ plan: { scope: "customer_list" } });

    const passedPlan = mocks.executeCompanyQueryPlan.mock.calls[0]![1] as { judgmentNeed: boolean };
    expect(passedPlan.judgmentNeed).toBe(false);
  });
});
