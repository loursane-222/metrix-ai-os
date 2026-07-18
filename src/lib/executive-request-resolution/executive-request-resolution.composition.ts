import {
  createCapabilityProviderRegistry,
  type CapabilityExecutionBinding,
  type CapabilityProvider,
  type CapabilityProviderAvailability,
  type SupportedCapabilityDescriptor,
} from "./capability-provider-registry";
import { ShadowExecutiveRequestResolver } from "./executive-request-resolution.shadow";

const VERSION = "1";

type ProviderInput = Readonly<{
  providerId: string;
  runtimeId: string;
  ownerBoundary: string;
  availability: CapabilityProviderAvailability;
  capabilities: readonly SupportedCapabilityDescriptor[];
}>;

function createProvider(input: ProviderInput): CapabilityProvider {
  const executionBindings = input.capabilities.flatMap((capability) => capability.executionBindings);

  return Object.freeze({
    providerId: input.providerId,
    runtimeId: input.runtimeId,
    ownerBoundary: input.ownerBoundary,
    availability: input.availability,
    version: VERSION,
    supportedCapabilities: input.capabilities,
    executionBindings,
    supports: (capabilityId: string) => input.capabilities.some(
      (capability) => capability.capabilityId === capabilityId,
    ),
    getCapability: (capabilityId: string) => input.capabilities.find(
      (capability) => capability.capabilityId === capabilityId,
    ) ?? null,
  });
}

function binding(
  bindingId: string,
  capabilityId: string,
  strategy: CapabilityExecutionBinding["strategy"],
  runtimeAdapterId: string,
  availability: CapabilityProviderAvailability,
): CapabilityExecutionBinding {
  return Object.freeze({
    bindingId,
    capabilityId,
    strategy,
    runtimeAdapterId,
    availability,
    version: VERSION,
  });
}

const generalAnswerCapability: SupportedCapabilityDescriptor = Object.freeze({
  capabilityId: "conversation.general-answer",
  businessOutcome: "Provide a response to general conversation.",
  requiredEntityTypes: [],
  requiredContextIds: [],
  supportedStrategies: ["ANSWER"] as const,
  availability: "AVAILABLE",
  version: VERSION,
  executionBindings: [binding(
    "conversation-response",
    "conversation.general-answer",
    "ANSWER",
    "chat-response:response-only",
    "AVAILABLE",
  )],
});

const companyContextCapability: SupportedCapabilityDescriptor = Object.freeze({
  capabilityId: "company.context-read",
  businessOutcome: "Read existing organization context.",
  requiredEntityTypes: [],
  requiredContextIds: ["organization-memory"],
  supportedStrategies: ["READ"] as const,
  availability: "READ_ONLY",
  version: VERSION,
  executionBindings: [binding(
    "organization-memory-read",
    "company.context-read",
    "READ",
    "executive-operating-context:organization-memory",
    "READ_ONLY",
  )],
});

const executiveAnalyzeCapability: SupportedCapabilityDescriptor = Object.freeze({
  capabilityId: "executive.analyze",
  businessOutcome: "Analyze company context for executive decision support.",
  requiredEntityTypes: [],
  requiredContextIds: ["executive-operating-context"],
  supportedStrategies: ["ANALYZE"] as const,
  availability: "READ_ONLY",
  version: VERSION,
  executionBindings: [binding(
    "executive-intelligence-read",
    "executive.analyze",
    "ANALYZE",
    "executive-intelligence:read-only",
    "READ_ONLY",
  )],
});

// Architecture Note: current Conversation Understanding has no identity,
// capability-awareness, memory-awareness, or interactive-research signal.
// These declarations report repository truth but cannot be authoritative
// matches until an upstream typed signal exists.
const executiveIdentityCapability: SupportedCapabilityDescriptor = Object.freeze({
  capabilityId: "executive.identity-read",
  businessOutcome: "Describe the durable METRIX executive identity.",
  requiredEntityTypes: [],
  requiredContextIds: [],
  supportedStrategies: ["READ"] as const,
  availability: "DECLARED_NOT_EXECUTABLE",
  version: VERSION,
  executionBindings: [],
});

const executiveCapabilitiesCapability: SupportedCapabilityDescriptor = Object.freeze({
  capabilityId: "executive.capabilities-read",
  businessOutcome: "Describe registered METRIX capability boundaries.",
  requiredEntityTypes: [],
  requiredContextIds: [],
  supportedStrategies: ["READ"] as const,
  availability: "DECLARED_NOT_EXECUTABLE",
  version: VERSION,
  executionBindings: [],
});

const executiveMemoryAwarenessCapability: SupportedCapabilityDescriptor = Object.freeze({
  capabilityId: "executive.memory-awareness-read",
  businessOutcome: "Describe whether organization memory context is available.",
  requiredEntityTypes: [],
  requiredContextIds: ["organization-memory"],
  supportedStrategies: ["READ"] as const,
  availability: "DECLARED_NOT_EXECUTABLE",
  version: VERSION,
  executionBindings: [],
});

const interactiveResearchCapability: SupportedCapabilityDescriptor = Object.freeze({
  capabilityId: "research.interactive-read",
  businessOutcome: "Research a user-selected topic interactively.",
  requiredEntityTypes: [],
  requiredContextIds: ["external-research-source"],
  supportedStrategies: ["RESEARCH"] as const,
  availability: "UNAVAILABLE",
  version: VERSION,
  executionBindings: [],
});

export function createShadowCapabilityProviderRegistry() {
  const registry = createCapabilityProviderRegistry();
  // Customer surface is intentionally absent: page/surface context is not an
  // input to this resolver, so a deterministic candidate cannot be proven.
  registry.register(createProvider({
    providerId: "conversation-response-provider",
    runtimeId: "chat-response",
    ownerBoundary: "conversation",
    availability: "AVAILABLE",
    capabilities: [generalAnswerCapability],
  }));
  registry.register(createProvider({
    providerId: "executive-memory-provider",
    runtimeId: "executive-operating-context",
    ownerBoundary: "memory",
    availability: "READ_ONLY",
    capabilities: [companyContextCapability],
  }));
  registry.register(createProvider({
    providerId: "executive-intelligence-provider",
    runtimeId: "executive-intelligence",
    ownerBoundary: "executive-intelligence",
    availability: "READ_ONLY",
    capabilities: [executiveAnalyzeCapability],
  }));
  registry.register(createProvider({
    providerId: "executive-identity-provider",
    runtimeId: "executive-identity-prompt-contract",
    ownerBoundary: "executive-identity",
    availability: "DECLARED_NOT_EXECUTABLE",
    capabilities: [
      executiveIdentityCapability,
      executiveCapabilitiesCapability,
      executiveMemoryAwarenessCapability,
    ],
  }));
  registry.register(createProvider({
    providerId: "interactive-research-provider",
    runtimeId: "research-director-batch-only",
    ownerBoundary: "research",
    availability: "UNAVAILABLE",
    capabilities: [interactiveResearchCapability],
  }));
  return registry;
}

/** Explicit shadow-only composition root; it registers no mutation provider. */
export function createShadowExecutiveRequestResolver(): ShadowExecutiveRequestResolver {
  return new ShadowExecutiveRequestResolver(createShadowCapabilityProviderRegistry());
}
