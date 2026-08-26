import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiValidationError } from "@/lib/api/validation";

const { createKpiDefinitionMock, listKpiDefinitionsForOrganizationMock } = vi.hoisted(() => ({
  createKpiDefinitionMock: vi.fn(),
  listKpiDefinitionsForOrganizationMock: vi.fn(),
}));

vi.mock("../kpi.repository", () => ({
  createKpiDefinition: createKpiDefinitionMock,
  listKpiDefinitionsForOrganization: listKpiDefinitionsForOrganizationMock,
  findKpiDefinitionById: vi.fn(),
}));

// listKpiDefinitions computes a real current value per row via the
// calculation engine, which reads Customer/Invoice/Payment directly — mock
// prisma so this stays a unit test, not a DB integration test.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { customer: { count: vi.fn().mockResolvedValue(7) } } }));

import { createNewKpiDefinition, listKpiDefinitions } from "../kpi.service";

const validInput = {
  organizationId: "org-1", key: "collection_coverage", label: "Tahsilat Kapsama Oranı", scope: "COMPANY",
  calculationMethod: { type: "COLLECTIONS_TOTAL" },
  period: "MONTHLY", createdByType: "USER", rationale: "Gerçek tahsilat hedeflerine göre kapsama takibi.",
};

describe("kpi.service", () => {
  beforeEach(() => {
    createKpiDefinitionMock.mockReset();
    listKpiDefinitionsForOrganizationMock.mockReset();
  });

  it("rejects a KPI definition missing a rationale (no fabricated/undocumented metrics)", async () => {
    await expect(createNewKpiDefinition({ ...validInput, rationale: "" })).rejects.toThrow(ApiValidationError);
    expect(createKpiDefinitionMock).not.toHaveBeenCalled();
  });

  it("rejects a KPI definition missing a key", async () => {
    await expect(createNewKpiDefinition({ ...validInput, key: "" })).rejects.toThrow(ApiValidationError);
    expect(createKpiDefinitionMock).not.toHaveBeenCalled();
  });

  it("creates a KPI definition when all required fields are present", async () => {
    createKpiDefinitionMock.mockResolvedValue({ id: "kpi-1", key: "collection_coverage" });

    const result = await createNewKpiDefinition(validInput);

    expect(result.id).toBe("kpi-1");
    expect(createKpiDefinitionMock).toHaveBeenCalledWith({ ...validInput, sourceDomainsJson: { domains: ["collections"] } });
  });

  // Regression: sourceDomainsJson used to be a caller-supplied field that
  // the calculation engine never read — a caller could declare any domain
  // (or a nonsense one) with no relation to what calculationMethod actually
  // measures. It's now derived server-side from calculationMethod (see the
  // test above), so it's always consistent with the real source domain the
  // engine computes from. This covers every supported formula, not just
  // COLLECTIONS_TOTAL.
  it("derives the correct source domain for each supported calculation method", async () => {
    createKpiDefinitionMock.mockResolvedValue({ id: "kpi-1", key: "any" });
    const cases = [
      [{ type: "FINANCE_METRIC", metric: "CASH_POSITION" }, "finance"],
      [{ type: "SALES_REVENUE" }, "sales"],
      [{ type: "PRODUCTION_UTILIZATION" }, "production"],
      [{ type: "PRODUCTION_LATE_ORDER_COUNT" }, "production"],
      [{ type: "CUSTOMER_ACTIVE_COUNT" }, "customer"],
      [{ type: "TASK_COMPLETION_RATE" }, "task"],
    ];
    for (const [calculationMethod, expectedDomain] of cases) {
      await createNewKpiDefinition({ ...validInput, calculationMethod });
      expect(createKpiDefinitionMock).toHaveBeenLastCalledWith({ ...validInput, calculationMethod, sourceDomainsJson: { domains: [expectedDomain] } });
    }
  });

  it("rejects a KPI definition whose calculationMethod is not a supported formula (no opaque, uninterpretable JSON)", async () => {
    await expect(createNewKpiDefinition({ ...validInput, calculationMethod: { type: "goal_ratio" } })).rejects.toThrow(ApiValidationError);
    expect(createKpiDefinitionMock).not.toHaveBeenCalled();
  });

  it("lists KPI definitions with a real computed current value alongside the linked-goal count", async () => {
    listKpiDefinitionsForOrganizationMock.mockResolvedValue([
      { id: "kpi-1", linkedGoalCount: 2, calculationMethod: { type: "CUSTOMER_ACTIVE_COUNT" }, period: "MONTHLY" },
    ]);

    const result = await listKpiDefinitions({ organizationId: "org-1" });

    expect(result).toHaveLength(1);
    expect(result[0].linkedGoalCount).toBe(2);
    expect(result[0].currentValue.sourceDomain).toBe("customer");
    expect(result[0].currentValue.confidence).toBe("MEASURED");
    expect(listKpiDefinitionsForOrganizationMock).toHaveBeenCalledWith({ organizationId: "org-1" });
  });

  it("reports an unavailable computed value for a pre-existing KPI whose calculationMethod predates validation, without throwing", async () => {
    listKpiDefinitionsForOrganizationMock.mockResolvedValue([
      { id: "kpi-legacy", linkedGoalCount: 0, calculationMethod: { type: "goal_ratio" }, period: "MONTHLY" },
    ]);

    const result = await listKpiDefinitions({ organizationId: "org-1" });

    expect(result[0].currentValue.available).toBe(false);
    expect(result[0].currentValue.confidence).toBe("UNAVAILABLE");
  });
});
