import { describe, expect, it } from "vitest";

import {
  ExecutiveRuntimeAdapterMapperError,
  createExecutiveRuntimeAdapterRequest,
} from "..";
import type {
  ExecutiveActionPresenceActionPlanDisposition,
  ExecutiveActionPresenceDisposition,
  ExecutiveActionPresencePageContext,
} from "../../executive-action-presence";

const primaryCapability = Object.freeze({
  role: "PRIMARY" as const,
  capabilityId: "customer.update",
  providerId: "customer-provider",
  confidence: { level: "high" as const, score: 0.99 },
  evidence: [],
});

const binding = Object.freeze({
  bindingId: "customer-update-binding",
  capabilityId: "customer.update",
  providerId: "customer-provider",
  strategy: "UPDATE" as const,
  mode: "EXECUTE" as const,
  runtimeAdapterId: "customers:update",
  availability: "AVAILABLE" as const,
  version: "1",
});

const metadata = Object.freeze({
  channel: "voice" as const,
  occurredAt: "2026-07-19T11:58:00.000Z",
  correlationReference: Object.freeze({
    correlationId: "corr-1",
    source: "executive-presence",
  }),
});

function actionPlan(
  pageContext: ExecutiveActionPresencePageContext | null = null,
): ExecutiveActionPresenceActionPlanDisposition {
  return {
    outcome: "ACTION_PLAN_REQUIRED",
    requestId: "req-1",
    organizationId: "org-1",
    resolutionStatus: "RESOLVED",
    executionStrategy: "UPDATE",
    executionMode: "EXECUTE",
    primaryCapabilityId: "customer.update",
    runtimeAdapterId: "customers:update",
    pageContext,
    generatedAt: "2026-07-19T11:59:00.000Z",
    primaryCapability,
    binding,
    intendedStrategy: "UPDATE",
    intendedMode: "EXECUTE",
    requiredContexts: [],
    resolvedEntities: [],
    missingInformation: [],
  };
}

function nonActionDisposition(
  outcome: Exclude<ExecutiveActionPresenceDisposition["outcome"], "ACTION_PLAN_REQUIRED">,
): ExecutiveActionPresenceDisposition {
  const base = {
    requestId: "req-1",
    organizationId: "org-1",
    resolutionStatus: "NO_MATCH" as const,
    executionStrategy: null,
    executionMode: "DEFERRED" as const,
    primaryCapabilityId: null,
    runtimeAdapterId: null,
    pageContext: null,
    generatedAt: "2026-07-19T11:59:00.000Z",
  };
  if (outcome === "RESPONSE_ONLY") {
    return { ...base, outcome, executionMode: "RESPONSE_ONLY", primaryCapability: null, binding: null };
  }
  if (outcome === "READ_ONLY") {
    return {
      ...base,
      outcome,
      resolutionStatus: "RESOLVED",
      executionStrategy: "READ",
      executionMode: "READ_ONLY",
      primaryCapabilityId: primaryCapability.capabilityId,
      runtimeAdapterId: binding.runtimeAdapterId,
      primaryCapability,
      binding: { ...binding, strategy: "READ", mode: "READ_ONLY" },
    };
  }
  if (outcome === "CLARIFICATION_REQUIRED") {
    return {
      ...base,
      outcome,
      resolutionStatus: "CLARIFICATION_REQUIRED",
      executionMode: "CLARIFICATION",
      blockingMissingInformation: [{
        key: "customer",
        description: "Customer required.",
        source: "request",
        reason: "NOT_PROVIDED",
        blocking: true,
      }],
      nonBlockingMissingInformation: [],
      clarificationReason: "BLOCKING_INFORMATION_REQUIRED",
    };
  }
  if (outcome === "DEFERRED") {
    return {
      ...base,
      outcome,
      reasonCode: "NO_MATCH",
      state: {
        capabilityAuthorityOutcome: "NO_PROVIDER",
        capabilityAuthorityReason: "NO_CAPABILITY_SIGNAL",
        bindingAvailability: null,
        candidateCapabilities: [],
      },
    };
  }
  return { ...base, outcome: "REJECTED", reasonCode: "INVALID_RESOLUTION_STATE" };
}

describe("createExecutiveRuntimeAdapterRequest", () => {
  it("maps ACTION_PLAN_REQUIRED without reinterpreting capability or binding", () => {
    const disposition = actionPlan();
    const result = createExecutiveRuntimeAdapterRequest(disposition, metadata);

    expect(result).toMatchObject({
      requestId: "req-1",
      organizationId: "org-1",
      channel: "voice",
      runtimeAdapterId: "customers:update",
      intendedStrategy: "UPDATE",
      intendedMode: "EXECUTE",
      occurredAt: metadata.occurredAt,
      presenceGeneratedAt: disposition.generatedAt,
    });
    expect(result.primaryCapability).toBe(disposition.primaryCapability);
    expect(result.binding).toBe(disposition.binding);
  });

  it.each([
    "RESPONSE_ONLY",
    "READ_ONLY",
    "CLARIFICATION_REQUIRED",
    "DEFERRED",
    "REJECTED",
  ] as const)("rejects %s dispositions", (outcome) => {
    expect(() => createExecutiveRuntimeAdapterRequest(nonActionDisposition(outcome), metadata))
      .toThrow(ExecutiveRuntimeAdapterMapperError);
  });

  it("fails closed when ACTION_PLAN_REQUIRED has no runtimeAdapterId", () => {
    const invalid = { ...actionPlan(), runtimeAdapterId: null };
    expect(() => createExecutiveRuntimeAdapterRequest(invalid, metadata))
      .toThrow(ExecutiveRuntimeAdapterMapperError);
  });

  it("fails closed when binding and disposition references diverge", () => {
    const invalid = {
      ...actionPlan(),
      binding: { ...binding, capabilityId: "customer.delete" },
    };
    expect(() => createExecutiveRuntimeAdapterRequest(invalid, metadata))
      .toThrow(ExecutiveRuntimeAdapterMapperError);
  });

  it("accepts null or present page context and snapshots the selection", () => {
    expect(createExecutiveRuntimeAdapterRequest(actionPlan(null), metadata).pageContext).toBeNull();
    const selection = ["cust-1"];
    const context: ExecutiveActionPresencePageContext = {
      module: "customers",
      surface: "detail",
      route: "/customers/cust-1",
      entityType: "customer",
      entityId: "cust-1",
      activeTab: "overview",
      activeForm: null,
      activeDraftId: null,
      selection,
      version: 2,
    };
    const result = createExecutiveRuntimeAdapterRequest(actionPlan(context), metadata);
    selection.push("cust-2");

    expect(result.pageContext?.selection).toEqual(["cust-1"]);
    expect(Object.isFrozen(result.pageContext)).toBe(true);
    expect(Object.isFrozen(result.pageContext?.selection)).toBe(true);
  });

  it("does not mutate the source disposition or metadata", () => {
    const disposition = actionPlan();
    const dispositionBefore = JSON.stringify(disposition);
    const metadataBefore = JSON.stringify(metadata);

    createExecutiveRuntimeAdapterRequest(disposition, metadata);

    expect(JSON.stringify(disposition)).toBe(dispositionBefore);
    expect(JSON.stringify(metadata)).toBe(metadataBefore);
  });
});
