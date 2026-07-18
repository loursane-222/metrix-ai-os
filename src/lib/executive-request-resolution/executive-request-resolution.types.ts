import type { ExecutionMode, ExecutionStrategy } from "./execution-strategy";
import type { ResolutionConfidence, ResolvedEntity } from "./entity-resolution.types";

/** Overall resolver outcome; downstream stages must branch on this field. */
export type ExecutiveRequestResolutionStatus =
  | "RESOLVED"
  | "NO_MATCH"
  | "AMBIGUOUS"
  | "CLARIFICATION_REQUIRED";

export type ExecutiveRequestIntent = Readonly<{
  name: string;
  summary: string;
}>;

export type CapabilityEvidenceType =
  | "UNDERSTANDING_SIGNAL"
  | "ENTITY_SIGNAL"
  | "CONTEXT_SIGNAL"
  | "PROVIDER_MATCH"
  | (string & Record<never, never>);

export type CapabilityEvidence = Readonly<{
  evidenceType: CapabilityEvidenceType;
  source: string;
  description?: string;
  reference?: string;
  confidence: ResolutionConfidence;
  providerId?: string;
}>;

type CapabilityMatchBase = Readonly<{
  capabilityId: string;
  providerId: string;
  confidence: ResolutionConfidence;
  evidence: readonly CapabilityEvidence[];
}>;

export type PrimaryResolvedCapability = CapabilityMatchBase & Readonly<{ role: "PRIMARY" }>;
export type CandidateResolvedCapability = CapabilityMatchBase & Readonly<{ role: "CANDIDATE" }>;
export type ResolvedCapability = PrimaryResolvedCapability | CandidateResolvedCapability;

export type ContextFreshnessRequirement = Readonly<{
  maxAgeMs: number | null;
  asOf?: string;
}>;

export type ContextSourceExpectation =
  | "REQUEST"
  | "CONVERSATION"
  | "PAGE_CONTEXT"
  | "ORGANIZATION_DATA"
  | "EXTERNAL_SOURCE"
  | (string & Record<never, never>);

/** A context requirement only; it never loads context or selects capability. */
export type RequiredContext = Readonly<{
  contextId: string;
  contextType: string;
  necessity: "REQUIRED" | "OPTIONAL";
  reason: string;
  freshness: ContextFreshnessRequirement;
  sourceExpectations: readonly ContextSourceExpectation[];
  confidence?: ResolutionConfidence;
  contractVersion: string;
}>;

export type MissingInformationReason =
  | "NOT_PROVIDED"
  | "AMBIGUOUS"
  | "STALE"
  | "UNAVAILABLE"
  | "VERIFICATION_FAILED"
  | (string & Record<never, never>);

type MissingInformationBase = Readonly<{
  key: string;
  description: string;
  source: string;
  reason: MissingInformationReason;
  blockedCapabilityId?: string;
  blockedContextId?: string;
  blockedEntityType?: string;
}>;

export type BlockingMissingInformation = MissingInformationBase & Readonly<{ blocking: true }>;
export type NonBlockingMissingInformation = MissingInformationBase & Readonly<{ blocking: false }>;
export type MissingInformation = BlockingMissingInformation | NonBlockingMissingInformation;

type ResolutionBase<TUnderstanding> = Readonly<{
  intent: ExecutiveRequestIntent | null;
  confidence: ResolutionConfidence;
  /** Exact upstream value used for this decision; no second interpretation. */
  sourceUnderstanding: TUnderstanding;
  entities: readonly ResolvedEntity[];
  requiredContexts: readonly RequiredContext[];
  missingInformation: readonly MissingInformation[];
}>;

export type ResolvedExecutiveRequest<TUnderstanding = unknown> = ResolutionBase<TUnderstanding> & Readonly<{
  status: "RESOLVED";
  capabilities: readonly [PrimaryResolvedCapability, ...CandidateResolvedCapability[]];
  executionStrategy: ExecutionStrategy;
  executionMode: Exclude<ExecutionMode, "CLARIFICATION">;
}>;

export type NoMatchExecutiveRequest<TUnderstanding = unknown> = ResolutionBase<TUnderstanding> & Readonly<{
  status: "NO_MATCH";
  capabilities: readonly [];
  executionStrategy: null;
  executionMode: "RESPONSE_ONLY" | "DEFERRED";
}>;

export type AmbiguousExecutiveRequest<TUnderstanding = unknown> = ResolutionBase<TUnderstanding> & Readonly<{
  status: "AMBIGUOUS";
  capabilities: readonly [CandidateResolvedCapability, CandidateResolvedCapability, ...CandidateResolvedCapability[]];
  executionStrategy: null;
  executionMode: "DEFERRED" | "CLARIFICATION";
}>;

export type ClarificationRequiredExecutiveRequest<TUnderstanding = unknown> =
  Omit<ResolutionBase<TUnderstanding>, "missingInformation"> & Readonly<{
    status: "CLARIFICATION_REQUIRED";
    capabilities: readonly ResolvedCapability[];
    executionStrategy: ExecutionStrategy | null;
    executionMode: "CLARIFICATION";
    /** First item is blocking, making the clarification invariant structural. */
    missingInformation: readonly [BlockingMissingInformation, ...MissingInformation[]];
  }>;

/**
 * Auditable output of Conversation Understanding -> Request Resolution.
 * Operating Context and EOS may consume it but never select capabilities;
 * Prompt Bridge never produces it.
 */
export type ExecutiveRequestResolution<TUnderstanding = unknown> =
  | ResolvedExecutiveRequest<TUnderstanding>
  | NoMatchExecutiveRequest<TUnderstanding>
  | AmbiguousExecutiveRequest<TUnderstanding>
  | ClarificationRequiredExecutiveRequest<TUnderstanding>;

export type ResolveExecutiveRequestInput<TUnderstanding = unknown> = Readonly<{
  requestId: string;
  organizationId: string;
  understanding: TUnderstanding;
}>;

export interface ExecutiveRequestResolver<TUnderstanding = unknown> {
  resolve(
    input: ResolveExecutiveRequestInput<TUnderstanding>,
  ): Promise<ExecutiveRequestResolution<TUnderstanding>>;
}
