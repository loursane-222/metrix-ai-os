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

import { createNewKpiDefinition, listKpiDefinitions } from "../kpi.service";

const validInput = {
  organizationId: "org-1", key: "collection_coverage", label: "Tahsilat Kapsama Oranı", scope: "COMPANY",
  calculationMethod: { type: "goal_ratio" }, sourceDomainsJson: { domains: ["payment", "goal"] },
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
    expect(createKpiDefinitionMock).toHaveBeenCalledWith(validInput);
  });

  it("lists KPI definitions for an organization with their real linked-goal count", async () => {
    listKpiDefinitionsForOrganizationMock.mockResolvedValue([{ id: "kpi-1", linkedGoalCount: 2 }]);

    const result = await listKpiDefinitions({ organizationId: "org-1" });

    expect(result).toEqual([{ id: "kpi-1", linkedGoalCount: 2 }]);
    expect(listKpiDefinitionsForOrganizationMock).toHaveBeenCalledWith({ organizationId: "org-1" });
  });
});
