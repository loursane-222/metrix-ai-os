import { describe, expect, it } from "vitest";

import {
  createCapabilityProviderRegistry,
  resolveCapabilityAuthority,
} from "..";
import type {
  CapabilityExecutionBinding,
  CapabilityProvider,
  CapabilityProviderAvailability,
  ExecutionStrategy,
  SupportedCapabilityDescriptor,
} from "..";

type ProviderOptions = Readonly<{
  providerId?: string;
  providerAvailability?: CapabilityProviderAvailability;
  capabilityAvailability?: CapabilityProviderAvailability;
  bindingAvailability?: CapabilityProviderAvailability;
  supportedStrategies?: readonly ExecutionStrategy[];
  bindings?: readonly CapabilityExecutionBinding[];
}>;

function provider(options: ProviderOptions = {}): CapabilityProvider {
  const capabilityId = "test.capability";
  const supportedStrategies = options.supportedStrategies ?? ["READ"];
  const bindings = options.bindings ?? [{
    bindingId: "test-read",
    capabilityId,
    strategy: "READ",
    runtimeAdapterId: "test:read-only",
    availability: options.bindingAvailability ?? "READ_ONLY",
    version: "1",
  }];
  const descriptor: SupportedCapabilityDescriptor = {
    capabilityId,
    businessOutcome: "Read test data.",
    requiredEntityTypes: [],
    requiredContextIds: [],
    supportedStrategies,
    availability: options.capabilityAvailability ?? "READ_ONLY",
    version: "1",
    executionBindings: bindings,
  };

  return {
    providerId: options.providerId ?? "test-provider",
    runtimeId: "test-runtime",
    ownerBoundary: "test",
    availability: options.providerAvailability ?? "READ_ONLY",
    version: "1",
    supportedCapabilities: [descriptor],
    executionBindings: bindings,
    supports: (id) => id === capabilityId,
    getCapability: (id) => id === capabilityId ? descriptor : null,
  };
}

function decide(
  options: ProviderOptions,
  strategy: ExecutionStrategy = "READ",
  mode: "RESPONSE_ONLY" | "READ_ONLY" | "DRAFT" | "EXECUTE" | "DEFERRED" = "READ_ONLY",
) {
  const registry = createCapabilityProviderRegistry();
  registry.register(provider(options));
  return resolveCapabilityAuthority({ registry, capabilityId: "test.capability", strategy, mode });
}

describe("capability authority", () => {
  it("rejects a missing provider", () => {
    const registry = createCapabilityProviderRegistry();
    expect(resolveCapabilityAuthority({
      registry,
      capabilityId: "missing.capability",
      strategy: "READ",
      mode: "READ_ONLY",
    })).toMatchObject({ outcome: "NO_PROVIDER", reason: "NO_PROVIDER" });
  });

  it.each([
    ["UNAVAILABLE", "UNAVAILABLE"],
    ["DECLARED_NOT_EXECUTABLE", "NON_EXECUTABLE"],
  ] as const)("rejects %s provider availability", (availability, outcome) => {
    expect(decide({ providerAvailability: availability })).toMatchObject({ outcome });
  });

  it.each([
    ["UNAVAILABLE", "UNAVAILABLE"],
    ["DECLARED_NOT_EXECUTABLE", "NON_EXECUTABLE"],
  ] as const)("rejects %s capability availability", (availability, outcome) => {
    expect(decide({ capabilityAvailability: availability })).toMatchObject({ outcome });
  });

  it.each([
    ["UNAVAILABLE", "UNAVAILABLE"],
    ["DECLARED_NOT_EXECUTABLE", "NON_EXECUTABLE"],
  ] as const)("rejects %s binding availability", (availability, outcome) => {
    expect(decide({ bindingAvailability: availability })).toMatchObject({ outcome });
  });

  it("rejects unsupported strategies", () => {
    expect(decide({}, "ANALYZE")).toMatchObject({
      outcome: "UNSUPPORTED_STRATEGY",
      reason: "UNSUPPORTED_STRATEGY",
    });
  });

  it("rejects a missing matching binding", () => {
    expect(decide({ bindings: [] })).toMatchObject({
      outcome: "BINDING_MISSING",
      reason: "BINDING_MISSING",
    });
  });

  it("rejects READ_ONLY authority for EXECUTE mode", () => {
    expect(decide({}, "READ", "EXECUTE")).toMatchObject({
      outcome: "INCOMPATIBLE_MODE",
      reason: "INCOMPATIBLE_MODE",
    });
  });

  it("rejects a binding more permissive than its descriptor and provider", () => {
    expect(decide({ bindingAvailability: "AVAILABLE" })).toMatchObject({
      outcome: "INCOMPATIBLE_MODE",
      reason: "INCOMPATIBLE_MODE",
    });
  });

  it("authorizes a matching read-only provider, descriptor, strategy, binding and mode", () => {
    expect(decide({})).toMatchObject({
      outcome: "AUTHORITATIVE",
      reason: "AUTHORIZED",
    });
  });

  it("preserves deterministic registration order during concurrent reads", async () => {
    const registry = createCapabilityProviderRegistry();
    registry.register(provider({ providerId: "first" }));
    registry.register(provider({ providerId: "second" }));

    const reads = await Promise.all(Array.from({ length: 8 }, async () => (
      registry.findProviders("test.capability").map((item) => item.providerId)
    )));

    expect(reads.every((ids) => ids.join(",") === "first,second")).toBe(true);
  });

  it("selects the first authoritative provider when an earlier provider is unavailable", () => {
    const registry = createCapabilityProviderRegistry();
    registry.register(provider({ providerId: "unavailable", providerAvailability: "UNAVAILABLE" }));
    registry.register(provider({ providerId: "authoritative" }));

    const decision = resolveCapabilityAuthority({
      registry,
      capabilityId: "test.capability",
      strategy: "READ",
      mode: "READ_ONLY",
    });

    expect(decision).toMatchObject({
      outcome: "AUTHORITATIVE",
      provider: { providerId: "authoritative" },
    });
  });

  it("selects the same provider and binding regardless of registration and binding input order", () => {
    const binding = (bindingId: string): CapabilityExecutionBinding => ({
      bindingId,
      capabilityId: "test.capability",
      strategy: "READ",
      runtimeAdapterId: bindingId,
      availability: "READ_ONLY",
      version: "1",
    });
    const registry = createCapabilityProviderRegistry();
    registry.register(provider({ providerId: "z-provider", bindings: [binding("z-binding"), binding("a-binding")] }));
    registry.register(provider({ providerId: "a-provider", bindings: [binding("z-binding"), binding("a-binding")] }));

    const decision = resolveCapabilityAuthority({
      registry,
      capabilityId: "test.capability",
      strategy: "READ",
      mode: "READ_ONLY",
    });

    expect(decision).toMatchObject({
      outcome: "AUTHORITATIVE",
      provider: { providerId: "a-provider" },
      binding: { bindingId: "a-binding" },
    });
  });
});
