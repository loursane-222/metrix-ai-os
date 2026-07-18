export {
  CapabilityProviderRegistry,
  DuplicateCapabilityProviderError,
  createCapabilityProviderRegistry,
  isExecutableBinding,
  isRuntimeInvocableAvailability,
} from "./capability-provider-registry";
export type {
  CapabilityExecutionBinding,
  CapabilityProvider,
  CapabilityProviderAvailability,
  CapabilityProviderDescriptor,
  SupportedCapabilityDescriptor,
} from "./capability-provider-registry";

export {
  CapabilityProviderContractError,
  ExecutiveRequestResolutionValidationError,
} from "./executive-request-resolution.errors";
export type { ResolutionValidationIssue } from "./executive-request-resolution.errors";

export { assertValidExecutiveRequestResolution } from "./executive-request-resolution.validation";
export { resolveExecutiveRequest } from "./executive-request-resolution.service";

export { CORE_EXECUTION_MODES, CORE_EXECUTION_STRATEGIES } from "./execution-strategy";
export type {
  CoreExecutionMode,
  CoreExecutionStrategy,
  ExecutionMode,
  ExecutionPlan,
  ExecutionStrategy,
} from "./execution-strategy";

export type {
  AmbiguousExecutiveRequest,
  BlockingMissingInformation,
  CandidateResolvedCapability,
  CapabilityEvidence,
  CapabilityEvidenceType,
  ClarificationRequiredExecutiveRequest,
  ContextFreshnessRequirement,
  ContextSourceExpectation,
  ExecutiveRequestIntent,
  ExecutiveRequestResolution,
  ExecutiveRequestResolutionStatus,
  ExecutiveRequestResolver,
  MissingInformation,
  MissingInformationReason,
  NoMatchExecutiveRequest,
  NonBlockingMissingInformation,
  PrimaryResolvedCapability,
  RequiredContext,
  ResolvedCapability,
  ResolvedExecutiveRequest,
  ResolveExecutiveRequestInput,
} from "./executive-request-resolution.types";

export {
  EntityOrganizationScopeError,
  assertEntityOrganizationScope,
} from "./entity-resolution.types";
export type {
  EntityFreshness,
  EntityReference,
  EntityResolutionCandidate,
  EntityVerificationSource,
  OrganizationScope,
  ResolutionConfidence,
  ResolutionConfidenceLevel,
  ResolvedEntity,
} from "./entity-resolution.types";
