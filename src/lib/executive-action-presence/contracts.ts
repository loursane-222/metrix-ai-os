import type {
  BlockingMissingInformation,
  CandidateResolvedCapability,
  ExecutiveRequestResolution,
  ExecutiveRequestResolutionStatus,
  ExecutionMode,
  ExecutionStrategy,
  MissingInformation,
  NonBlockingMissingInformation,
  PrimaryResolvedCapability,
  RequiredContext,
  ResolvedEntity,
} from "../executive-request-resolution";

export type ExecutiveActionPresenceChannel = "text" | "voice";

export type ExecutiveActionPresencePageContext = Readonly<{
  module: string;
  surface: string;
  route: string;
  entityType: string | null;
  entityId: string | null;
  activeTab: string | null;
  activeForm: string | null;
  activeDraftId: string | null;
  selection: readonly string[];
  version: number;
}>;

export type ExecutiveActionPresenceRequest<TUnderstanding = unknown> = Readonly<{
  requestId: string;
  organizationId: string;
  channel: ExecutiveActionPresenceChannel;
  resolution: ExecutiveRequestResolution<TUnderstanding>;
  pageContext?: ExecutiveActionPresencePageContext | null;
  occurredAt: string;
}>;

export type ExecutiveActionPresenceBindingAvailability =
  | "AVAILABLE"
  | "READ_ONLY"
  | "DECLARED_NOT_EXECUTABLE"
  | "UNAVAILABLE";

export type ExecutiveActionPresenceBindingReference = Readonly<{
  bindingId: string;
  capabilityId: string;
  providerId: string;
  strategy: ExecutionStrategy;
  mode: Exclude<ExecutionMode, "CLARIFICATION">;
  runtimeAdapterId: string;
  availability: ExecutiveActionPresenceBindingAvailability;
  version: string;
}>;

export type ExecutiveActionPresenceBindingResolutionFailure = Readonly<{
  status: "FAILURE";
  reasonCode: "NOT_FOUND" | "UNAVAILABLE" | "NON_INVOCABLE" | "INCOMPATIBLE" | "RESOLUTION_FAILED";
  availability?: ExecutiveActionPresenceBindingAvailability;
}>;

export type ExecutiveActionPresenceBindingResolution =
  | Readonly<{
      status: "RESOLVED";
      binding: ExecutiveActionPresenceBindingReference;
    }>
  | ExecutiveActionPresenceBindingResolutionFailure;

export type ResolveExecutiveActionPresenceBindingInput = Readonly<{
  capabilityId: string;
  providerId: string;
  strategy: ExecutionStrategy;
  mode: Exclude<ExecutionMode, "CLARIFICATION">;
}>;

export interface ExecutiveActionPresenceBindingResolver {
  resolveBinding(
    input: ResolveExecutiveActionPresenceBindingInput,
  ): ExecutiveActionPresenceBindingResolution | Promise<ExecutiveActionPresenceBindingResolution>;
}

export interface ExecutiveActionPresenceClock {
  now(): Date;
}

type DispositionBase = Readonly<{
  requestId: string;
  organizationId: string;
  resolutionStatus: ExecutiveRequestResolutionStatus;
  executionStrategy: ExecutionStrategy | null;
  executionMode: ExecutionMode;
  primaryCapabilityId: string | null;
  runtimeAdapterId: string | null;
  pageContext: ExecutiveActionPresencePageContext | null;
  generatedAt: string;
}>;

type PassiveDisposition = DispositionBase & Readonly<{
  primaryCapability: PrimaryResolvedCapability | null;
  binding: ExecutiveActionPresenceBindingReference | null;
}>;

export type ExecutiveActionPresenceResponseOnlyDisposition = PassiveDisposition & Readonly<{
  outcome: "RESPONSE_ONLY";
}>;

export type ExecutiveActionPresenceReadOnlyDisposition = DispositionBase & Readonly<{
  outcome: "READ_ONLY";
  primaryCapability: PrimaryResolvedCapability;
  binding: ExecutiveActionPresenceBindingReference;
}>;

export type ExecutiveActionPresenceClarificationDisposition = DispositionBase & Readonly<{
  outcome: "CLARIFICATION_REQUIRED";
  blockingMissingInformation: readonly BlockingMissingInformation[];
  nonBlockingMissingInformation: readonly NonBlockingMissingInformation[];
  clarificationReason: "BLOCKING_INFORMATION_REQUIRED" | "AMBIGUOUS_CAPABILITY";
}>;

export type ExecutiveActionPresenceDeferredReasonCode =
  | "NO_MATCH"
  | "RESOLUTION_DEFERRED"
  | "AMBIGUOUS_CAPABILITY"
  | "NON_AUTHORITATIVE"
  | "BINDING_NOT_FOUND"
  | "BINDING_UNAVAILABLE"
  | "BINDING_NON_INVOCABLE"
  | "BINDING_INCOMPATIBLE"
  | "BINDING_RESOLUTION_FAILED";

export type ExecutiveActionPresenceDeferredDisposition = DispositionBase & Readonly<{
  outcome: "DEFERRED";
  reasonCode: ExecutiveActionPresenceDeferredReasonCode;
  state: Readonly<{
    capabilityAuthorityOutcome: string;
    capabilityAuthorityReason: string;
    bindingAvailability: ExecutiveActionPresenceBindingAvailability | null;
    candidateCapabilities: readonly CandidateResolvedCapability[];
  }>;
}>;

export type ExecutiveActionPresenceActionPlanDisposition = DispositionBase & Readonly<{
  outcome: "ACTION_PLAN_REQUIRED";
  primaryCapability: PrimaryResolvedCapability;
  binding: ExecutiveActionPresenceBindingReference;
  intendedStrategy: ExecutionStrategy;
  intendedMode: "DRAFT" | "EXECUTE";
  requiredContexts: readonly RequiredContext[];
  resolvedEntities: readonly ResolvedEntity[];
  missingInformation: readonly MissingInformation[];
}>;

export type ExecutiveActionPresenceRejectedReasonCode =
  | "INVALID_RESOLUTION_STATE"
  | "INVALID_PRIMARY_CAPABILITY"
  | "AUTHORITY_REFERENCE_MISMATCH"
  | "BINDING_REFERENCE_MISMATCH"
  | "UNSUPPORTED_RESOLVED_MODE";

export type ExecutiveActionPresenceRejectedDisposition = DispositionBase & Readonly<{
  outcome: "REJECTED";
  reasonCode: ExecutiveActionPresenceRejectedReasonCode;
}>;

export type ExecutiveActionPresenceDisposition =
  | ExecutiveActionPresenceResponseOnlyDisposition
  | ExecutiveActionPresenceReadOnlyDisposition
  | ExecutiveActionPresenceClarificationDisposition
  | ExecutiveActionPresenceDeferredDisposition
  | ExecutiveActionPresenceActionPlanDisposition
  | ExecutiveActionPresenceRejectedDisposition;
