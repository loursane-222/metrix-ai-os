import type {
  ExecutiveActionPresenceBindingReference,
  ExecutiveActionPresenceChannel,
  ExecutiveActionPresencePageContext,
} from "../executive-action-presence";
import type {
  ExecutionMode,
  ExecutionStrategy,
  MissingInformation,
  PrimaryResolvedCapability,
  RequiredContext,
  ResolvedEntity,
} from "../executive-request-resolution";

export type ExecutiveRuntimeAdapterId = string;

export type ExecutiveRuntimeAdapterAvailability =
  | "AVAILABLE"
  | "READ_ONLY"
  | "DECLARED_NOT_EXECUTABLE"
  | "UNAVAILABLE";

/**
 * Adapter metadata only. It is neither capability authority nor an Action
 * Registry definition, and it does not prove that a downstream plan can run.
 */
export type ExecutiveRuntimeAdapterDescriptor = Readonly<{
  adapterId: ExecutiveRuntimeAdapterId;
  ownerBoundary: string;
  version: string;
  supportedCapabilities: readonly string[];
  supportedStrategies: readonly ExecutionStrategy[];
  supportedModes: readonly Exclude<ExecutionMode, "CLARIFICATION">[];
  availability: ExecutiveRuntimeAdapterAvailability;
}>;

export type ExecutiveRuntimeAdapterCorrelationReference = Readonly<{
  correlationId: string;
  source: string;
}>;

export type ExecutiveRuntimeAdapterRequest = Readonly<{
  requestId: string;
  organizationId: string;
  channel: ExecutiveActionPresenceChannel;
  runtimeAdapterId: ExecutiveRuntimeAdapterId;
  primaryCapability: PrimaryResolvedCapability;
  binding: ExecutiveActionPresenceBindingReference;
  intendedStrategy: ExecutionStrategy;
  intendedMode: Exclude<ExecutionMode, "CLARIFICATION">;
  requiredContexts: readonly RequiredContext[];
  resolvedEntities: readonly ResolvedEntity[];
  missingInformation: readonly MissingInformation[];
  pageContext: ExecutiveActionPresencePageContext | null;
  occurredAt: string;
  presenceGeneratedAt: string;
  correlationReference: ExecutiveRuntimeAdapterCorrelationReference;
}>;

/**
 * Phase 2 adapters only declare whether they accept a typed handoff. A future
 * domain-owned planner contract may consume READY; no planner is invoked here.
 */
export interface ExecutiveRuntimeAdapter {
  readonly descriptor: ExecutiveRuntimeAdapterDescriptor;
  canHandle(request: ExecutiveRuntimeAdapterRequest): boolean | Promise<boolean>;
}

export type CreateExecutiveRuntimeAdapterRequestMetadata = Readonly<{
  channel: ExecutiveActionPresenceChannel;
  occurredAt: string;
  correlationReference: ExecutiveRuntimeAdapterCorrelationReference;
}>;

export type ExecutiveRuntimeAdapterHandoff = Readonly<{
  status: "READY";
  adapterId: ExecutiveRuntimeAdapterId;
  ownerBoundary: string;
  version: string;
  requestId: string;
  organizationId: string;
  capabilityId: string;
  providerId: string;
  intendedStrategy: ExecutionStrategy;
  intendedMode: Exclude<ExecutionMode, "CLARIFICATION">;
  pageContextAvailable: boolean;
  generatedAt: string;
  correlationReference: ExecutiveRuntimeAdapterCorrelationReference;
}>;

type DispatchFailureBase = Readonly<{
  adapterId: ExecutiveRuntimeAdapterId;
  requestId: string;
  organizationId: string;
  generatedAt: string;
}>;

export type ExecutiveRuntimeAdapterDispatchResult =
  | ExecutiveRuntimeAdapterHandoff
  | (DispatchFailureBase & Readonly<{ status: "NOT_FOUND" }>)
  | (DispatchFailureBase & Readonly<{
      status: "UNAVAILABLE";
      availability: "UNAVAILABLE";
    }>)
  | (DispatchFailureBase & Readonly<{
      status: "NON_INVOCABLE";
      availability: "READ_ONLY" | "DECLARED_NOT_EXECUTABLE";
    }>)
  | (DispatchFailureBase & Readonly<{
      status: "INCOMPATIBLE";
      reasonCode: "CAPABILITY" | "STRATEGY" | "MODE" | "ADAPTER_DECLINED";
    }>)
  | (DispatchFailureBase & Readonly<{
      status: "REJECTED";
      reasonCode: "INVALID_INPUT" | "BINDING_MISMATCH" | "ADAPTER_EVALUATION_FAILED";
    }>);

export interface ExecutiveRuntimeAdapterRegistry {
  register(adapter: ExecutiveRuntimeAdapter): void;
  unregister(adapterId: ExecutiveRuntimeAdapterId): boolean;
  get(adapterId: ExecutiveRuntimeAdapterId): ExecutiveRuntimeAdapter | null;
  has(adapterId: ExecutiveRuntimeAdapterId): boolean;
  list(): readonly ExecutiveRuntimeAdapter[];
}

export interface ExecutiveRuntimeAdapterClock {
  now(): Date;
}

export interface ExecutiveRuntimeAdapterDispatcher {
  dispatch(request: ExecutiveRuntimeAdapterRequest): Promise<ExecutiveRuntimeAdapterDispatchResult>;
}
