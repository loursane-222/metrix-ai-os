import type { ExecutionStrategy } from "./execution-strategy";
import { CapabilityProviderContractError } from "./executive-request-resolution.errors";

export type CapabilityProviderAvailability =
  | "AVAILABLE"
  | "READ_ONLY"
  | "DECLARED_NOT_EXECUTABLE"
  | "UNAVAILABLE";

export type CapabilityExecutionBinding = Readonly<{
  bindingId: string;
  capabilityId: string;
  strategy: ExecutionStrategy;
  /** Stable adapter contract identifier, not a handler or tool invocation. */
  runtimeAdapterId: string;
  availability: CapabilityProviderAvailability;
  version: string;
}>;

export type SupportedCapabilityDescriptor = Readonly<{
  capabilityId: string;
  businessOutcome: string;
  requiredEntityTypes: readonly string[];
  requiredContextIds: readonly string[];
  supportedStrategies: readonly ExecutionStrategy[];
  availability: CapabilityProviderAvailability;
  version: string;
  executionBindings: readonly CapabilityExecutionBinding[];
}>;

export type CapabilityProviderDescriptor = Readonly<{
  providerId: string;
  runtimeId: string;
  ownerBoundary: string;
  availability: CapabilityProviderAvailability;
  version: string;
  supportedCapabilities: readonly SupportedCapabilityDescriptor[];
  executionBindings: readonly CapabilityExecutionBinding[];
}>;

/** Plugin boundary; capability metadata remains provider-owned. */
export interface CapabilityProvider {
  readonly providerId: string;
  readonly runtimeId: string;
  readonly ownerBoundary: string;
  readonly availability: CapabilityProviderAvailability;
  readonly version: string;
  readonly supportedCapabilities: readonly SupportedCapabilityDescriptor[];
  readonly executionBindings: readonly CapabilityExecutionBinding[];
  supports(capabilityId: string): boolean;
  getCapability(capabilityId: string): SupportedCapabilityDescriptor | null;
}

export class DuplicateCapabilityProviderError extends Error {
  constructor(providerId: string) {
    super(`Capability provider "${providerId}" is already registered.`);
    this.name = "DuplicateCapabilityProviderError";
  }
}

export function isRuntimeInvocableAvailability(
  availability: CapabilityProviderAvailability,
): boolean {
  return availability === "AVAILABLE" || availability === "READ_ONLY";
}

export function isExecutableBinding(binding: CapabilityExecutionBinding): boolean {
  return binding.availability === "AVAILABLE";
}

export class CapabilityProviderRegistry {
  private readonly providers = new Map<string, CapabilityProvider>();

  register(provider: CapabilityProvider): void {
    assertProviderContract(provider);
    if (this.providers.has(provider.providerId)) {
      throw new DuplicateCapabilityProviderError(provider.providerId);
    }
    this.providers.set(provider.providerId, provider);
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  getProvider(providerId: string): CapabilityProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  listProviders(): readonly CapabilityProvider[] {
    return Object.freeze([...this.providers.values()]);
  }

  findProviders(capabilityId: string): readonly CapabilityProvider[] {
    return Object.freeze(
      [...this.providers.values()].filter((provider) => provider.supports(capabilityId)),
    );
  }
}

function assertProviderContract(provider: CapabilityProvider): void {
  const identityFields = [provider.providerId, provider.runtimeId, provider.ownerBoundary, provider.version];
  if (identityFields.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new CapabilityProviderContractError(provider.providerId, "Provider identity fields must be non-empty.");
  }

  for (const capability of provider.supportedCapabilities) {
    for (const binding of capability.executionBindings) {
      if (binding.capabilityId !== capability.capabilityId) {
        throw new CapabilityProviderContractError(
          provider.providerId,
          `Binding "${binding.bindingId}" targets a different capability.`,
        );
      }
      if (!capability.supportedStrategies.includes(binding.strategy)) {
        throw new CapabilityProviderContractError(
          provider.providerId,
          `Binding "${binding.bindingId}" uses an unsupported strategy.`,
        );
      }
    }
  }
  const declaredCapabilityIds = new Set(
    provider.supportedCapabilities.map((capability) => capability.capabilityId),
  );
  for (const binding of provider.executionBindings) {
    if (!declaredCapabilityIds.has(binding.capabilityId)) {
      throw new CapabilityProviderContractError(
        provider.providerId,
        `Binding "${binding.bindingId}" has no supported capability descriptor.`,
      );
    }
  }
}

export function createCapabilityProviderRegistry(): CapabilityProviderRegistry {
  return new CapabilityProviderRegistry();
}
