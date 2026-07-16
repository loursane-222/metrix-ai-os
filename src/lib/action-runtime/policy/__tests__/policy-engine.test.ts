import { describe, expect, it } from "vitest";

import { actionRegistry } from "../../registry";
import { createPolicyEngine } from "../policy-engine";
import type { PolicyActionRegistry, PolicyActorContext } from "../policy.types";
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

function buildFakeRegistry(definitions: ActionDefinition[]): PolicyActionRegistry {
  const byName = new Map(definitions.map((definition) => [definition.actionName, definition]));

  return {
    getActionDefinition(actionName: string) {
      const definition = byName.get(actionName);
      if (!definition) {
        throw new Error(`Action "${actionName}" was not found in the fake registry.`);
      }
      return definition;
    },
  };
}

function buildActor(overrides: Partial<PolicyActorContext> = {}): PolicyActorContext {
  return {
    actorId: "actor_1",
    organizationId: "org_1",
    role: "EMPLOYEE",
    permissions: [],
    sessionRef: "session_1",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

describe("PolicyEngine — unregistered action", () => {
  it("denies an action that does not exist in the registry", () => {
    const engine = createPolicyEngine({ registry: buildFakeRegistry([]) });

    const decision = engine.evaluatePolicy({
      actionName: "unknown.action",
      actorContext: buildActor(),
    });

    expect(decision.outcome).toBe("DENY");
    expect(decision.reasonCode).toBe("ACTION_NOT_REGISTERED");
  });
});

describe("PolicyEngine — approvalPolicy=NONE", () => {
  it("allows when the actor has every required permission", () => {
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({ actionName: "customer.update", requiredPermissionSet: ["customers.write"] }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "customer.update",
      actorContext: buildActor({ permissions: ["customers.write"] }),
    });

    expect(decision.outcome).toBe("ALLOW");
    expect(decision.reasonCode).toBe("ALLOWED");
  });

  it("denies when a required permission is missing", () => {
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({ actionName: "customer.update", requiredPermissionSet: ["customers.write"] }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "customer.update",
      actorContext: buildActor({ permissions: [] }),
    });

    expect(decision.outcome).toBe("DENY");
    expect(decision.reasonCode).toBe("PERMISSION_DENIED");
    expect(decision.missingPermissions).toEqual(["customers.write"]);
  });

  it("denies a high-privilege role when the permission set is missing (role is not a substitute)", () => {
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({ actionName: "customer.archive", requiredPermissionSet: ["customers.archive"] }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "customer.archive",
      actorContext: buildActor({ role: "OWNER", permissions: [] }),
    });

    expect(decision.outcome).toBe("DENY");
    expect(decision.reasonCode).toBe("PERMISSION_DENIED");
  });
});

describe("PolicyEngine — approvalPolicy=EXPLICIT", () => {
  it("requires approval even though permission is satisfied", () => {
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({
          actionName: "customer.archive",
          requiredPermissionSet: ["customers.archive"],
          approvalPolicy: "EXPLICIT",
          riskLevelBase: "HIGH",
        }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "customer.archive",
      actorContext: buildActor({ permissions: ["customers.archive"] }),
      normalizedInputHash: "hash_1",
    });

    expect(decision.outcome).toBe("REQUIRES_APPROVAL");
    expect(decision.reasonCode).toBe("EXPLICIT_APPROVAL_REQUIRED");
    expect(decision.approvalRequest).toBeDefined();
    expect(decision.approvalRequest?.status).toBe("PENDING");
  });

  it("does not allow without an explicit ApprovalGrant validation", () => {
    // evaluatePolicy never inspects a grant — REQUIRES_APPROVAL is always
    // returned for EXPLICIT policy regardless of any prior approval state.
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({ actionName: "customer.archive", approvalPolicy: "EXPLICIT" }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "customer.archive",
      actorContext: buildActor(),
    });

    expect(decision.outcome).not.toBe("ALLOW");
  });
});

describe("PolicyEngine — approvalPolicy=CONDITIONAL", () => {
  it("allows when the computed runtime risk is LOW", () => {
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({ actionName: "payment.apply", approvalPolicy: "CONDITIONAL", riskLevelBase: "LOW" }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "payment.apply",
      actorContext: buildActor(),
    });

    expect(decision.outcome).toBe("ALLOW");
    expect(decision.reasonCode).toBe("CONDITIONAL_RISK_ALLOWED");
    expect(decision.riskLevelComputed).toBe("LOW");
  });

  it("requires approval when the computed runtime risk escalates to HIGH", () => {
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({ actionName: "payment.apply", approvalPolicy: "CONDITIONAL", riskLevelBase: "LOW" }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "payment.apply",
      actorContext: buildActor(),
      normalizedInputHash: "hash_1",
      runtimeRiskContext: { reversibilityClass: "IRREVERSIBLE" },
    });

    expect(decision.outcome).toBe("REQUIRES_APPROVAL");
    expect(decision.reasonCode).toBe("CONDITIONAL_RISK_APPROVAL_REQUIRED");
    expect(decision.riskLevelComputed).toBe("HIGH");
  });

  it("denies regardless of risk level when permission is missing", () => {
    const engine = createPolicyEngine({
      registry: buildFakeRegistry([
        buildActionDefinition({
          actionName: "payment.apply",
          requiredPermissionSet: ["payments.write"],
          approvalPolicy: "CONDITIONAL",
          riskLevelBase: "LOW",
        }),
      ]),
    });

    const decision = engine.evaluatePolicy({
      actionName: "payment.apply",
      actorContext: buildActor({ permissions: [] }),
    });

    expect(decision.outcome).toBe("DENY");
  });
});

describe("PolicyEngine — immutable decisions", () => {
  it("freezes the returned PolicyDecision", () => {
    const engine = createPolicyEngine({ registry: buildFakeRegistry([buildActionDefinition()]) });

    const decision = engine.evaluatePolicy({ actionName: "test.action", actorContext: buildActor() });

    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.requiredPermissions)).toBe(true);
    expect(Object.isFrozen(decision.missingPermissions)).toBe(true);
  });
});

describe("PolicyEngine — real Registry integration", () => {
  it("requires approval for the real, registered customer.archive DOMAIN action", () => {
    const engine = createPolicyEngine({ registry: actionRegistry });

    const decision = engine.evaluatePolicy({
      actionName: "customer.archive",
      actorContext: buildActor({ permissions: ["customers.write", "customers.archive"] }),
    });

    expect(decision.outcome).toBe("REQUIRES_APPROVAL");
  });

  it("denies a completely unregistered action name against the real registry", () => {
    const engine = createPolicyEngine({ registry: actionRegistry });

    const decision = engine.evaluatePolicy({
      actionName: "customer.teleport",
      actorContext: buildActor(),
    });

    expect(decision.outcome).toBe("DENY");
    expect(decision.reasonCode).toBe("ACTION_NOT_REGISTERED");
  });

  it("evaluates the real draft.set_field SURFACE action through the same generic pipeline", () => {
    const engine = createPolicyEngine({ registry: actionRegistry });

    const decision = engine.evaluatePolicy({
      actionName: "draft.set_field",
      actorContext: buildActor(),
    });

    expect(decision.outcome).toBe("ALLOW");
  });
});
