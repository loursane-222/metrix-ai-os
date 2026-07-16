import { describe, expect, it } from "vitest";

import { computeRuntimeRisk } from "../risk-evaluator";
import type { ActionDefinition } from "../../registry/action-registry.types";

function buildActionDefinition(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    actionName: "test.action",
    actionClass: "DOMAIN",
    ownerModule: "test",
    inputSchema: {},
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
    ...overrides,
  };
}

describe("computeRuntimeRisk", () => {
  it("returns the base risk when no runtime context is given", () => {
    expect(computeRuntimeRisk(buildActionDefinition({ riskLevelBase: "MEDIUM" }))).toBe("MEDIUM");
  });

  it("never lowers the base risk via organization overrides", () => {
    const definition = buildActionDefinition({ riskLevelBase: "HIGH" });

    const computed = computeRuntimeRisk(definition, {
      organizationPolicyOverrides: { minimumRiskLevel: "LOW" },
    });

    expect(computed).toBe("HIGH");
  });

  it("escalates to at least HIGH when there is an external side effect", () => {
    const definition = buildActionDefinition({ riskLevelBase: "LOW" });

    expect(computeRuntimeRisk(definition, { externalSideEffect: true })).toBe("HIGH");
  });

  it("escalates to at least HIGH when the change is irreversible", () => {
    const definition = buildActionDefinition({ riskLevelBase: "LOW" });

    expect(computeRuntimeRisk(definition, { reversibilityClass: "IRREVERSIBLE" })).toBe("HIGH");
  });

  it("applies an organization policy minimum risk override upward", () => {
    const definition = buildActionDefinition({ riskLevelBase: "LOW" });

    const computed = computeRuntimeRisk(definition, {
      organizationPolicyOverrides: { minimumRiskLevel: "CRITICAL" },
    });

    expect(computed).toBe("CRITICAL");
  });

  it("does not escalate beyond the base risk when reversible and no side effects", () => {
    const definition = buildActionDefinition({ riskLevelBase: "MEDIUM" });

    const computed = computeRuntimeRisk(definition, { reversibilityClass: "REVERSIBLE", externalSideEffect: false });

    expect(computed).toBe("MEDIUM");
  });

  it("combines multiple escalators by taking the highest", () => {
    const definition = buildActionDefinition({ riskLevelBase: "LOW" });

    const computed = computeRuntimeRisk(definition, {
      externalSideEffect: true,
      organizationPolicyOverrides: { minimumRiskLevel: "CRITICAL" },
    });

    expect(computed).toBe("CRITICAL");
  });
});
