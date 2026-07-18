import { describe, expect, it, vi } from "vitest";

import {
  CORE_EXECUTION_STRATEGIES,
  DuplicateCapabilityProviderError,
  ExecutiveRequestResolutionValidationError,
  createCapabilityProviderRegistry,
  isExecutableBinding,
  resolveExecutiveRequest,
} from "..";
import type {
  CapabilityExecutionBinding,
  CapabilityProvider,
  CandidateResolvedCapability,
  ClarificationRequiredExecutiveRequest,
  CoreExecutionStrategy,
  ExecutiveRequestResolution,
  PrimaryResolvedCapability,
  ResolvedExecutiveRequest,
} from "..";

const understanding = Object.freeze({
  conversationKind: "company_related",
  confidence: "high",
});

const confidence = Object.freeze({ level: "high" as const, score: 0.95 });

function primaryCapability(capabilityId = "customer.update"): PrimaryResolvedCapability {
  return {
    role: "PRIMARY",
    capabilityId,
    providerId: "customer-provider",
    confidence,
    evidence: [{
      evidenceType: "UNDERSTANDING_SIGNAL",
      source: "conversation-understanding",
      reference: "action-expectation",
      confidence,
      providerId: "customer-provider",
    }],
  };
}

function candidateCapability(capabilityId: string): CandidateResolvedCapability {
  return {
    ...primaryCapability(capabilityId),
    role: "CANDIDATE",
  };
}

function resolvedRequest(): ResolvedExecutiveRequest<typeof understanding> {
  return {
    status: "RESOLVED",
    intent: { name: "update_customer", summary: "Update a customer record." },
    confidence,
    sourceUnderstanding: understanding,
    capabilities: [primaryCapability()],
    entities: [],
    requiredContexts: [],
    executionStrategy: "UPDATE",
    executionMode: "DRAFT",
    missingInformation: [],
  };
}

function blockingInformation() {
  return {
    key: "customer-id",
    description: "Customer identity must be clarified.",
    blocking: true as const,
    source: "entity-resolution",
    reason: "AMBIGUOUS" as const,
    blockedEntityType: "customer",
  };
}

describe("ExecutiveRequestResolution invariants", () => {
  it("accepts RESOLVED with exactly one primary capability", async () => {
    const result = resolvedRequest();

    await expect(resolveExecutiveRequest(
      { requestId: "req-1", organizationId: "org-1", understanding },
      { resolve: async () => result },
    )).resolves.toBe(result);
  });

  it("rejects more than one primary capability", async () => {
    const invalid = {
      ...resolvedRequest(),
      capabilities: [primaryCapability(), primaryCapability("customer.archive")],
    } as unknown as ExecutiveRequestResolution<typeof understanding>;

    await expect(resolveExecutiveRequest(
      { requestId: "req-2", organizationId: "org-1", understanding },
      { resolve: async () => invalid },
    )).rejects.toThrow(ExecutiveRequestResolutionValidationError);
  });

  it("rejects a primary capability in NO_MATCH", async () => {
    const invalid = {
      ...resolvedRequest(),
      status: "NO_MATCH",
      capabilities: [primaryCapability()],
      executionStrategy: null,
      executionMode: "RESPONSE_ONLY",
    } as unknown as ExecutiveRequestResolution<typeof understanding>;

    await expect(resolveExecutiveRequest(
      { requestId: "req-3", organizationId: "org-1", understanding },
      { resolve: async () => invalid },
    )).rejects.toThrow(ExecutiveRequestResolutionValidationError);
  });

  it("requires blocking information for CLARIFICATION_REQUIRED", async () => {
    const invalid = {
      ...resolvedRequest(),
      status: "CLARIFICATION_REQUIRED",
      capabilities: [candidateCapability("customer.update")],
      executionStrategy: null,
      executionMode: "CLARIFICATION",
      missingInformation: [],
    } as unknown as ClarificationRequiredExecutiveRequest<typeof understanding>;

    await expect(resolveExecutiveRequest(
      { requestId: "req-4", organizationId: "org-1", understanding },
      { resolve: async () => invalid },
    )).rejects.toThrow(ExecutiveRequestResolutionValidationError);
  });

  it("accepts clarification with blocking information", async () => {
    const result: ClarificationRequiredExecutiveRequest<typeof understanding> = {
      ...resolvedRequest(),
      status: "CLARIFICATION_REQUIRED",
      capabilities: [candidateCapability("customer.update")],
      executionStrategy: null,
      executionMode: "CLARIFICATION",
      missingInformation: [blockingInformation()],
    };

    await expect(resolveExecutiveRequest(
      { requestId: "req-5", organizationId: "org-1", understanding },
      { resolve: async () => result },
    )).resolves.toBe(result);
  });

  it("rejects cross-organization entity references", async () => {
    const invalid: ResolvedExecutiveRequest<typeof understanding> = {
      ...resolvedRequest(),
      entities: [{
        status: "RESOLVED",
        organizationId: "org-1",
        requestedEntityType: "customer",
        reference: { organizationId: "org-2", entityType: "customer", entityId: "cust-1" },
        verificationSource: "DOMAIN_LOOKUP",
        confidence,
        freshness: { verifiedAt: "2026-01-01T00:00:00.000Z", maxAgeMs: 60_000 },
        contractVersion: "1",
        candidates: [],
      }],
    };

    await expect(resolveExecutiveRequest(
      { requestId: "req-6", organizationId: "org-1", understanding },
      { resolve: async () => invalid },
    )).rejects.toThrow(ExecutiveRequestResolutionValidationError);
  });

  it("delegates once to the injected resolver and preserves source understanding", async () => {
    const result = resolvedRequest();
    const resolve = vi.fn(async () => result);

    const actual = await resolveExecutiveRequest(
      { requestId: "req-7", organizationId: "org-1", understanding },
      { resolve },
    );

    expect(resolve).toHaveBeenCalledOnce();
    expect(actual.sourceUnderstanding).toBe(understanding);
  });

  it("rejects a resolver result built from a different understanding value", async () => {
    const invalid = {
      ...resolvedRequest(),
      sourceUnderstanding: { ...understanding },
    };

    await expect(resolveExecutiveRequest(
      { requestId: "req-8", organizationId: "org-1", understanding },
      { resolve: async () => invalid },
    )).rejects.toThrow(ExecutiveRequestResolutionValidationError);
  });

  it("rejects a malformed resolver root with a typed validation error", async () => {
    await expect(resolveExecutiveRequest(
      { requestId: "req-9", organizationId: "org-1", understanding },
      { resolve: async () => null as unknown as ResolvedExecutiveRequest<typeof understanding> },
    )).rejects.toThrow(ExecutiveRequestResolutionValidationError);
  });

  it("does not model APPROVAL as a core execution strategy", () => {
    expect(CORE_EXECUTION_STRATEGIES).not.toContain("APPROVAL");
    // @ts-expect-error Approval is a later policy outcome, not a core strategy.
    const invalidStrategy: CoreExecutionStrategy = "APPROVAL";
    expect(invalidStrategy).toBe("APPROVAL");
  });
});

describe("CapabilityProviderRegistry", () => {
  const declaredBinding: CapabilityExecutionBinding = {
    bindingId: "customer-create-manifest",
    capabilityId: "customer.create",
    strategy: "CREATE",
    runtimeAdapterId: "action-runtime:customer-create",
    availability: "DECLARED_NOT_EXECUTABLE",
    version: "1",
  };

  function provider(): CapabilityProvider {
    const capability = {
      capabilityId: "customer.create",
      businessOutcome: "Create a customer.",
      requiredEntityTypes: [],
      requiredContextIds: [],
      supportedStrategies: ["CREATE" as const],
      availability: "DECLARED_NOT_EXECUTABLE" as const,
      version: "1",
      executionBindings: [declaredBinding],
    };

    return {
      providerId: "customer-provider",
      runtimeId: "customer-runtime",
      ownerBoundary: "customers",
      availability: "AVAILABLE",
      version: "1",
      supportedCapabilities: [capability],
      executionBindings: [declaredBinding],
      supports: (capabilityId) => capabilityId === capability.capabilityId,
      getCapability: (capabilityId) => capabilityId === capability.capabilityId ? capability : null,
    };
  }

  it("throws a typed error for duplicate providerId", () => {
    const registry = createCapabilityProviderRegistry();
    registry.register(provider());

    expect(() => registry.register(provider())).toThrow(DuplicateCapabilityProviderError);
  });

  it("keeps provider availability separate from executable binding availability", () => {
    const registry = createCapabilityProviderRegistry();
    registry.register(provider());

    expect(registry.getProvider("customer-provider")?.availability).toBe("AVAILABLE");
    expect(isExecutableBinding(declaredBinding)).toBe(false);
    expect(registry.findProviders("customer.create")).toHaveLength(1);
  });
});
