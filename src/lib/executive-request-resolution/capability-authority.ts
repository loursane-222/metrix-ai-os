import type {
  CapabilityExecutionBinding,
  CapabilityProvider,
  CapabilityProviderAvailability,
  CapabilityProviderRegistry,
  SupportedCapabilityDescriptor,
} from "./capability-provider-registry";
import type { CapabilityAuthorityOutcome, CapabilityResolutionReason } from "./executive-request-resolution.types";
import type { ExecutionMode, ExecutionStrategy } from "./execution-strategy";

type AuthorityMatch = Readonly<{
  outcome: "AUTHORITATIVE";
  reason: "AUTHORIZED";
  provider: CapabilityProvider;
  descriptor: SupportedCapabilityDescriptor;
  binding: CapabilityExecutionBinding;
}>;

type AuthorityRejection = Readonly<{
  outcome: Exclude<CapabilityAuthorityOutcome, "AUTHORITATIVE" | "NOT_APPLICABLE">;
  reason: Exclude<CapabilityResolutionReason, "AUTHORIZED" | "SHADOW_DISABLED" | "MISSING_CONTEXT" | "AMBIGUOUS" | "NO_CAPABILITY_SIGNAL">;
  provider: CapabilityProvider | null;
  descriptor: SupportedCapabilityDescriptor | null;
  binding: CapabilityExecutionBinding | null;
}>;

export type CapabilityAuthorityDecision = AuthorityMatch | AuthorityRejection;

export type ResolveCapabilityAuthorityInput = Readonly<{
  registry: CapabilityProviderRegistry;
  capabilityId: string;
  strategy: ExecutionStrategy;
  mode: Exclude<ExecutionMode, "CLARIFICATION">;
}>;

/**
 * Registry is the capability availability authority. Conversation Understanding
 * supplies intent signals only; shouldInvokeExecutiveBrain is not a capability.
 * An execution strategy is metadata here, never an ActionExecutionRequest.
 */
export function resolveCapabilityAuthority(
  input: ResolveCapabilityAuthorityInput,
): CapabilityAuthorityDecision {
  const providers = input.registry.findProviders(input.capabilityId);
  if (providers.length === 0) return rejected("NO_PROVIDER", "NO_PROVIDER", null, null, null);

  const decisions = providers.map((provider) => resolveProviderAuthority(input, provider));
  return decisions.find((decision) => decision.outcome === "AUTHORITATIVE") ?? decisions[0]!;
}

function resolveProviderAuthority(
  input: ResolveCapabilityAuthorityInput,
  provider: CapabilityProvider,
): CapabilityAuthorityDecision {
  const descriptor = provider.getCapability(input.capabilityId);
  if (!descriptor) return rejected("NO_PROVIDER", "NO_PROVIDER", provider, null, null);

  const availabilityDecision = rejectAvailability(provider.availability, descriptor.availability);
  if (availabilityDecision) {
    return rejected(availabilityDecision.outcome, availabilityDecision.reason, provider, descriptor, null);
  }

  if (!descriptor.supportedStrategies.includes(input.strategy)) {
    return rejected("UNSUPPORTED_STRATEGY", "UNSUPPORTED_STRATEGY", provider, descriptor, null);
  }

  const binding = [...descriptor.executionBindings]
    .filter((candidate) => candidate.strategy === input.strategy)
    .sort((left, right) => left.bindingId.localeCompare(right.bindingId))[0] ?? null;
  if (!binding) {
    return rejected("BINDING_MISSING", "BINDING_MISSING", provider, descriptor, null);
  }

  const bindingDecision = rejectAvailability(binding.availability, binding.availability);
  if (bindingDecision) {
    return rejected(bindingDecision.outcome, bindingDecision.reason, provider, descriptor, binding);
  }

  if (
    availabilityRank(binding.availability) > availabilityRank(provider.availability)
    || availabilityRank(binding.availability) > availabilityRank(descriptor.availability)
    || !isModeCompatible(input.mode, provider.availability, descriptor.availability, binding.availability)
  ) {
    return rejected("INCOMPATIBLE_MODE", "INCOMPATIBLE_MODE", provider, descriptor, binding);
  }

  return { outcome: "AUTHORITATIVE", reason: "AUTHORIZED", provider, descriptor, binding };
}

function rejectAvailability(
  providerAvailability: CapabilityProviderAvailability,
  capabilityAvailability: CapabilityProviderAvailability,
): Readonly<{ outcome: "NON_EXECUTABLE" | "UNAVAILABLE"; reason: "NON_EXECUTABLE" | "UNAVAILABLE" }> | null {
  if (providerAvailability === "UNAVAILABLE" || capabilityAvailability === "UNAVAILABLE") {
    return { outcome: "UNAVAILABLE", reason: "UNAVAILABLE" };
  }
  if (
    providerAvailability === "DECLARED_NOT_EXECUTABLE"
    || capabilityAvailability === "DECLARED_NOT_EXECUTABLE"
  ) {
    return { outcome: "NON_EXECUTABLE", reason: "NON_EXECUTABLE" };
  }
  return null;
}

function isModeCompatible(
  mode: Exclude<ExecutionMode, "CLARIFICATION">,
  providerAvailability: CapabilityProviderAvailability,
  capabilityAvailability: CapabilityProviderAvailability,
  bindingAvailability: CapabilityProviderAvailability,
): boolean {
  if (mode === "DEFERRED") return false;
  if (mode === "EXECUTE" || mode === "DRAFT") {
    return [providerAvailability, capabilityAvailability, bindingAvailability].every(
      (availability) => availability === "AVAILABLE",
    );
  }
  return [providerAvailability, capabilityAvailability, bindingAvailability].every(
    (availability) => availability === "AVAILABLE" || availability === "READ_ONLY",
  );
}

function availabilityRank(availability: CapabilityProviderAvailability): number {
  if (availability === "AVAILABLE") return 2;
  if (availability === "READ_ONLY") return 1;
  return 0;
}

function rejected(
  outcome: AuthorityRejection["outcome"],
  reason: AuthorityRejection["reason"],
  provider: CapabilityProvider | null,
  descriptor: SupportedCapabilityDescriptor | null,
  binding: CapabilityExecutionBinding | null,
): AuthorityRejection {
  return { outcome, reason, provider, descriptor, binding };
}
