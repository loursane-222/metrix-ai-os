import { describe, expect, it, vi } from "vitest";

import {
  createExecutiveActionPresenceRuntime,
} from "..";
import type {
  ExecutiveActionPresenceBindingReference,
  ExecutiveActionPresenceBindingResolver,
  ExecutiveActionPresencePageContext,
  ExecutiveActionPresenceRequest,
} from "..";
import type {
  CandidateResolvedCapability,
  ExecutiveRequestResolution,
  ExecutionMode,
  ExecutionStrategy,
  PrimaryResolvedCapability,
} from "../../executive-request-resolution";

const understanding = Object.freeze({ kind: "company_related" });
const confidence = Object.freeze({ level: "high" as const, score: 0.98 });
const fixedNow = new Date("2026-07-19T10:00:00.000Z");

function primary(
  capabilityId = "customer.update",
  providerId = "customer-provider",
): PrimaryResolvedCapability {
  return {
    role: "PRIMARY",
    capabilityId,
    providerId,
    confidence,
    evidence: [],
  };
}

function candidate(capabilityId: string): CandidateResolvedCapability {
  return { ...primary(capabilityId), role: "CANDIDATE" };
}

function resolved(
  strategy: ExecutionStrategy,
  mode: Exclude<ExecutionMode, "CLARIFICATION">,
): ExecutiveRequestResolution<typeof understanding> {
  return {
    status: "RESOLVED",
    intent: { name: "customer_change", summary: "Change the customer." },
    confidence,
    sourceUnderstanding: understanding,
    capabilities: [primary()],
    entities: [],
    requiredContexts: [],
    missingInformation: [],
    executionStrategy: strategy,
    executionMode: mode,
    capabilityAuthority: {
      outcome: "AUTHORITATIVE",
      reason: "AUTHORIZED",
      capabilityId: "customer.update",
      providerId: "customer-provider",
    },
  };
}

function binding(
  strategy: ExecutionStrategy,
  mode: Exclude<ExecutionMode, "CLARIFICATION">,
  availability: ExecutiveActionPresenceBindingReference["availability"] = "AVAILABLE",
): ExecutiveActionPresenceBindingReference {
  return {
    bindingId: `customer-${strategy.toLowerCase()}`,
    capabilityId: "customer.update",
    providerId: "customer-provider",
    strategy,
    mode,
    runtimeAdapterId: "action-runtime:customer-update",
    availability,
    version: "1",
  };
}

function request(
  resolution: ExecutiveRequestResolution<typeof understanding>,
  pageContext?: ExecutiveActionPresencePageContext | null,
): ExecutiveActionPresenceRequest<typeof understanding> {
  return {
    requestId: "req-1",
    organizationId: "org-1",
    channel: "text",
    resolution,
    pageContext,
    occurredAt: "2026-07-19T09:59:00.000Z",
  };
}

function runtimeWith(resolveBinding: ExecutiveActionPresenceBindingResolver["resolveBinding"]) {
  return createExecutiveActionPresenceRuntime({
    bindingResolver: { resolveBinding },
    clock: { now: () => fixedNow },
  });
}

function resolvedBinding(strategy: ExecutionStrategy, mode: Exclude<ExecutionMode, "CLARIFICATION">) {
  return { status: "RESOLVED" as const, binding: binding(strategy, mode) };
}

describe("ExecutiveActionPresenceRuntime", () => {
  it("maps RESOLVED + ANSWER + RESPONSE_ONLY without mutation intent", async () => {
    const result = await runtimeWith(() => resolvedBinding("ANSWER", "RESPONSE_ONLY"))
      .resolvePresence(request(resolved("ANSWER", "RESPONSE_ONLY")));

    expect(result).toMatchObject({
      outcome: "RESPONSE_ONLY",
      executionStrategy: "ANSWER",
      executionMode: "RESPONSE_ONLY",
      primaryCapabilityId: "customer.update",
      runtimeAdapterId: "action-runtime:customer-update",
    });
    expect(result).not.toHaveProperty("intendedMode");
  });

  it("maps RESOLVED + READ + READ_ONLY and retains binding metadata", async () => {
    const result = await runtimeWith(() => ({
      status: "RESOLVED",
      binding: binding("READ", "READ_ONLY", "READ_ONLY"),
    })).resolvePresence(request(resolved("READ", "READ_ONLY")));

    expect(result.outcome).toBe("READ_ONLY");
    if (result.outcome === "READ_ONLY") {
      expect(result.binding?.bindingId).toBe("customer-read");
      expect(result.primaryCapability.capabilityId).toBe("customer.update");
    }
  });

  it("preserves clarification information and never resolves a binding", async () => {
    const resolveBinding = vi.fn(() => resolvedBinding("UPDATE", "DRAFT"));
    const resolution: ExecutiveRequestResolution<typeof understanding> = {
      ...resolved("UPDATE", "DRAFT"),
      status: "CLARIFICATION_REQUIRED",
      executionMode: "CLARIFICATION",
      missingInformation: [{
        key: "customer-id",
        description: "Customer is required.",
        source: "entity-resolution",
        reason: "NOT_PROVIDED",
        blocking: true,
      }, {
        key: "note",
        description: "A note is optional.",
        source: "request",
        reason: "NOT_PROVIDED",
        blocking: false,
      }],
    };

    const result = await runtimeWith(resolveBinding).resolvePresence(request(resolution));

    expect(result.outcome).toBe("CLARIFICATION_REQUIRED");
    if (result.outcome === "CLARIFICATION_REQUIRED") {
      expect(result.blockingMissingInformation).toHaveLength(1);
      expect(result.nonBlockingMissingInformation).toHaveLength(1);
    }
    expect(resolveBinding).not.toHaveBeenCalled();
  });

  it("does not fabricate a capability for NO_MATCH response or deferred modes", async () => {
    const resolveBinding = vi.fn();
    const base = {
      intent: null,
      confidence,
      sourceUnderstanding: understanding,
      capabilities: [] as const,
      entities: [],
      requiredContexts: [],
      missingInformation: [],
      executionStrategy: null,
      capabilityAuthority: { outcome: "NO_PROVIDER" as const, reason: "NO_CAPABILITY_SIGNAL" as const },
    };
    const response = await runtimeWith(resolveBinding).resolvePresence(request({
      ...base,
      status: "NO_MATCH",
      executionMode: "RESPONSE_ONLY",
    }));
    const deferred = await runtimeWith(resolveBinding).resolvePresence(request({
      ...base,
      status: "NO_MATCH",
      executionMode: "DEFERRED",
    }));

    expect(response).toMatchObject({ outcome: "RESPONSE_ONLY", primaryCapabilityId: null });
    expect(deferred).toMatchObject({ outcome: "DEFERRED", reasonCode: "NO_MATCH", primaryCapabilityId: null });
    expect(resolveBinding).not.toHaveBeenCalled();
  });

  it("defers AMBIGUOUS without selecting a primary or resolving a binding", async () => {
    const resolveBinding = vi.fn();
    const resolution: ExecutiveRequestResolution<typeof understanding> = {
      status: "AMBIGUOUS",
      intent: { name: "customer_change", summary: "Change a customer." },
      confidence,
      sourceUnderstanding: understanding,
      capabilities: [candidate("customer.update"), candidate("customer.archive")],
      entities: [],
      requiredContexts: [],
      missingInformation: [],
      executionStrategy: null,
      executionMode: "DEFERRED",
      capabilityAuthority: { outcome: "NOT_APPLICABLE", reason: "AMBIGUOUS" },
    };

    const result = await runtimeWith(resolveBinding).resolvePresence(request(resolution));

    expect(result).toMatchObject({
      outcome: "DEFERRED",
      reasonCode: "AMBIGUOUS_CAPABILITY",
      primaryCapabilityId: null,
    });
    expect(resolveBinding).not.toHaveBeenCalled();
  });

  it.each([
    ["CREATE", "DRAFT"],
    ["UPDATE", "EXECUTE"],
  ] as const)("maps authoritative %s + %s to an action-plan handoff only", async (strategy, mode) => {
    const resolveBinding = vi.fn(() => resolvedBinding(strategy, mode));
    const result = await runtimeWith(resolveBinding).resolvePresence(request(resolved(strategy, mode)));

    expect(result).toMatchObject({
      outcome: "ACTION_PLAN_REQUIRED",
      intendedStrategy: strategy,
      intendedMode: mode,
      runtimeAdapterId: "action-runtime:customer-update",
    });
    expect(resolveBinding).toHaveBeenCalledOnce();
    expect(result).not.toHaveProperty("actionExecutionRequest");
    expect(result).not.toHaveProperty("resolvedDomainActionRequest");
    expect(result).not.toHaveProperty("idempotencyKey");
  });

  it("fails closed when a mutation resolution is not authoritative", async () => {
    const resolveBinding = vi.fn();
    const invalid = {
      ...resolved("UPDATE", "EXECUTE"),
      capabilityAuthority: {
        outcome: "NON_EXECUTABLE",
        reason: "SHADOW_DISABLED",
        capabilityId: "customer.update",
        providerId: "customer-provider",
      },
    } as unknown as ExecutiveRequestResolution<typeof understanding>;

    const result = await runtimeWith(resolveBinding).resolvePresence(request(invalid));

    expect(result).toMatchObject({ outcome: "DEFERRED", reasonCode: "NON_AUTHORITATIVE" });
    expect(resolveBinding).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_FOUND", "BINDING_NOT_FOUND"],
    ["UNAVAILABLE", "BINDING_UNAVAILABLE"],
    ["NON_INVOCABLE", "BINDING_NON_INVOCABLE"],
  ] as const)("fails closed for %s binding resolution", async (reasonCode, expected) => {
    const result = await runtimeWith(() => ({
      status: "FAILURE",
      reasonCode,
      availability: reasonCode === "UNAVAILABLE" ? "UNAVAILABLE" : undefined,
    })).resolvePresence(request(resolved("UPDATE", "EXECUTE")));

    expect(result).toMatchObject({ outcome: "DEFERRED", reasonCode: expected, runtimeAdapterId: null });
  });

  it("does not action-plan a resolved but non-invocable binding", async () => {
    const result = await runtimeWith(() => ({
      status: "RESOLVED",
      binding: binding("CREATE", "DRAFT", "READ_ONLY"),
    })).resolvePresence(request(resolved("CREATE", "DRAFT")));

    expect(result).toMatchObject({
      outcome: "DEFERRED",
      reasonCode: "BINDING_NON_INVOCABLE",
      runtimeAdapterId: null,
    });
  });

  it("rejects an impossible multiple-primary state without calling the resolver", async () => {
    const resolveBinding = vi.fn();
    const invalid = {
      ...resolved("UPDATE", "DRAFT"),
      capabilities: [primary(), primary("customer.archive")],
    } as unknown as ExecutiveRequestResolution<typeof understanding>;

    const result = await runtimeWith(resolveBinding).resolvePresence(request(invalid));

    expect(result).toMatchObject({ outcome: "REJECTED", reasonCode: "INVALID_PRIMARY_CAPABILITY" });
    expect(resolveBinding).not.toHaveBeenCalled();
  });

  it("accepts null page context and snapshots supplied page context immutably", async () => {
    const noContext = await runtimeWith(() => resolvedBinding("ANSWER", "RESPONSE_ONLY"))
      .resolvePresence(request(resolved("ANSWER", "RESPONSE_ONLY"), null));
    expect(noContext.pageContext).toBeNull();

    const selection = ["cust-1"];
    const pageContext: ExecutiveActionPresencePageContext = {
      module: "customers",
      surface: "customer-detail",
      route: "/customers/cust-1",
      entityType: "customer",
      entityId: "cust-1",
      activeTab: "overview",
      activeForm: null,
      activeDraftId: null,
      selection,
      version: 3,
    };
    const withContext = await runtimeWith(() => resolvedBinding("READ", "READ_ONLY"))
      .resolvePresence(request(resolved("READ", "READ_ONLY"), pageContext));
    selection.push("cust-2");

    expect(withContext.pageContext?.selection).toEqual(["cust-1"]);
    expect(Object.isFrozen(withContext.pageContext)).toBe(true);
    expect(Object.isFrozen(withContext.pageContext?.selection)).toBe(true);
  });

  it("does not mutate input and is deterministic with fixed dependencies", async () => {
    const resolution = resolved("UPDATE", "EXECUTE");
    const input = request(resolution);
    const before = JSON.stringify(input);
    const runtime = runtimeWith(() => resolvedBinding("UPDATE", "EXECUTE"));

    const first = await runtime.resolvePresence(input);
    const second = await runtime.resolvePresence(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(input.resolution).toBe(resolution);
    expect(first).toEqual(second);
  });
});
