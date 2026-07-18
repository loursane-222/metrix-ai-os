import { ExecutiveActionPresenceInputError } from "./executive-action-presence.errors";
import type {
  ExecutiveActionPresenceBindingReference,
  ExecutiveActionPresenceBindingResolutionFailure,
  ExecutiveActionPresenceBindingResolver,
  ExecutiveActionPresenceClock,
  ExecutiveActionPresenceDeferredDisposition,
  ExecutiveActionPresenceDeferredReasonCode,
  ExecutiveActionPresenceDisposition,
  ExecutiveActionPresencePageContext,
  ExecutiveActionPresenceRequest,
  ExecutiveActionPresenceRejectedReasonCode,
} from "./contracts";
import type {
  CandidateResolvedCapability,
  ExecutiveRequestResolution,
  MissingInformation,
  PrimaryResolvedCapability,
} from "../executive-request-resolution";

export type ExecutiveActionPresenceRuntimeDependencies = Readonly<{
  bindingResolver: ExecutiveActionPresenceBindingResolver;
  clock: ExecutiveActionPresenceClock;
}>;

export interface ExecutiveActionPresenceRuntime {
  resolvePresence<TUnderstanding>(
    request: ExecutiveActionPresenceRequest<TUnderstanding>,
  ): Promise<ExecutiveActionPresenceDisposition>;
}

export function createExecutiveActionPresenceRuntime(
  dependencies: ExecutiveActionPresenceRuntimeDependencies,
): ExecutiveActionPresenceRuntime {
  if (!dependencies?.bindingResolver || typeof dependencies.bindingResolver.resolveBinding !== "function") {
    throw new ExecutiveActionPresenceInputError("bindingResolver", "A binding resolver is required.");
  }
  if (!dependencies.clock || typeof dependencies.clock.now !== "function") {
    throw new ExecutiveActionPresenceInputError("clock", "A clock is required.");
  }

  return Object.freeze({
    async resolvePresence<TUnderstanding>(
      request: ExecutiveActionPresenceRequest<TUnderstanding>,
    ): Promise<ExecutiveActionPresenceDisposition> {
      assertValidRequest(request);
      const generatedAt = dependencies.clock.now().toISOString();
      const pageContext = projectPageContext(request.pageContext);
      const resolution = request.resolution;
      const base = {
        requestId: request.requestId,
        organizationId: request.organizationId,
        resolutionStatus: resolution.status,
        executionStrategy: resolution.executionStrategy,
        executionMode: resolution.executionMode,
        primaryCapabilityId: primaryCapabilities(resolution)[0]?.capabilityId ?? null,
        runtimeAdapterId: null,
        pageContext,
        generatedAt,
      } as const;

      if (resolution.status === "CLARIFICATION_REQUIRED") {
        const blocking = resolution.missingInformation.filter(isBlocking);
        const nonBlocking = resolution.missingInformation.filter(isNonBlocking);
        return Object.freeze({
          ...base,
          outcome: "CLARIFICATION_REQUIRED",
          blockingMissingInformation: Object.freeze([...blocking]),
          nonBlockingMissingInformation: Object.freeze([...nonBlocking]),
          clarificationReason: "BLOCKING_INFORMATION_REQUIRED",
        });
      }

      if (resolution.status === "AMBIGUOUS") {
        return deferred(base, resolution, "AMBIGUOUS_CAPABILITY", null);
      }

      if (resolution.status === "NO_MATCH") {
        if (resolution.executionMode === "RESPONSE_ONLY") {
          return Object.freeze({
            ...base,
            outcome: "RESPONSE_ONLY",
            primaryCapability: null,
            binding: null,
          });
        }
        return deferred(base, resolution, "NO_MATCH", null);
      }

      const primaries = primaryCapabilities(resolution);
      if (primaries.length !== 1) {
        return rejected(base, "INVALID_PRIMARY_CAPABILITY");
      }
      const primary = primaries[0]!;
      if (resolution.capabilityAuthority.outcome !== "AUTHORITATIVE") {
        return deferred(base, resolution, "NON_AUTHORITATIVE", null);
      }
      if (
        resolution.capabilityAuthority.capabilityId !== primary.capabilityId
        || resolution.capabilityAuthority.providerId !== primary.providerId
      ) {
        return rejected(base, "AUTHORITY_REFERENCE_MISMATCH");
      }

      if (resolution.executionMode === "DEFERRED") {
        return deferred(base, resolution, "RESOLUTION_DEFERRED", null);
      }
      if (!resolution.executionStrategy) {
        return rejected(base, "INVALID_RESOLUTION_STATE");
      }

      let bindingResult;
      try {
        bindingResult = await dependencies.bindingResolver.resolveBinding({
          capabilityId: primary.capabilityId,
          providerId: primary.providerId,
          strategy: resolution.executionStrategy,
          mode: resolution.executionMode,
        });
      } catch {
        return deferred(base, resolution, "BINDING_RESOLUTION_FAILED", null);
      }
      if (bindingResult.status === "FAILURE") {
        return deferred(
          base,
          resolution,
          bindingFailureReason(bindingResult),
          bindingResult.availability ?? null,
        );
      }

      const binding = bindingResult.binding;
      if (!bindingMatches(binding, primary, resolution.executionStrategy, resolution.executionMode)) {
        return rejected(base, "BINDING_REFERENCE_MISMATCH");
      }
      const boundBase = { ...base, runtimeAdapterId: binding.runtimeAdapterId } as const;

      if (resolution.executionMode === "RESPONSE_ONLY" || resolution.executionMode === "READ_ONLY") {
        if (!isReadable(binding.availability)) {
          return deferred(base, resolution, "BINDING_NON_INVOCABLE", binding.availability);
        }
        return Object.freeze({
          ...boundBase,
          outcome: resolution.executionMode,
          primaryCapability: primary,
          binding,
        });
      }

      if (resolution.executionMode === "DRAFT" || resolution.executionMode === "EXECUTE") {
        if (binding.availability !== "AVAILABLE") {
          return deferred(base, resolution, "BINDING_NON_INVOCABLE", binding.availability);
        }
        return Object.freeze({
          ...boundBase,
          outcome: "ACTION_PLAN_REQUIRED",
          primaryCapability: primary,
          binding,
          intendedStrategy: resolution.executionStrategy,
          intendedMode: resolution.executionMode,
          requiredContexts: Object.freeze([...resolution.requiredContexts]),
          resolvedEntities: Object.freeze([...resolution.entities]),
          missingInformation: Object.freeze([...resolution.missingInformation]),
        });
      }

      return rejected(base, "UNSUPPORTED_RESOLVED_MODE");
    },
  });
}

function assertValidRequest<TUnderstanding>(request: ExecutiveActionPresenceRequest<TUnderstanding>): void {
  if (!request || typeof request !== "object") {
    throw new ExecutiveActionPresenceInputError("request", "Request must be an object.");
  }
  for (const field of ["requestId", "organizationId", "occurredAt"] as const) {
    if (typeof request[field] !== "string" || request[field].trim().length === 0) {
      throw new ExecutiveActionPresenceInputError(field, `${field} must be a non-empty string.`);
    }
  }
  if (request.channel !== "text" && request.channel !== "voice") {
    throw new ExecutiveActionPresenceInputError("channel", "Channel must be text or voice.");
  }
  if (Number.isNaN(Date.parse(request.occurredAt))) {
    throw new ExecutiveActionPresenceInputError("occurredAt", "occurredAt must be an ISO-compatible timestamp.");
  }
  if (!request.resolution || typeof request.resolution !== "object") {
    throw new ExecutiveActionPresenceInputError("resolution", "A validated resolution is required.");
  }
}

function projectPageContext(
  context: ExecutiveActionPresencePageContext | null | undefined,
): ExecutiveActionPresencePageContext | null {
  if (!context) return null;
  return Object.freeze({
    module: context.module,
    surface: context.surface,
    route: context.route,
    entityType: context.entityType,
    entityId: context.entityId,
    activeTab: context.activeTab,
    activeForm: context.activeForm,
    activeDraftId: context.activeDraftId,
    selection: Object.freeze([...context.selection]),
    version: context.version,
  });
}

function primaryCapabilities(
  resolution: ExecutiveRequestResolution<unknown>,
): readonly PrimaryResolvedCapability[] {
  const matches: PrimaryResolvedCapability[] = [];
  for (const capability of resolution.capabilities) {
    if (capability.role === "PRIMARY") matches.push(capability);
  }
  return matches;
}

function candidateCapabilities(
  resolution: ExecutiveRequestResolution<unknown>,
): readonly CandidateResolvedCapability[] {
  const matches: CandidateResolvedCapability[] = [];
  for (const capability of resolution.capabilities) {
    if (capability.role === "CANDIDATE") matches.push(capability);
  }
  return matches;
}

function deferred(
  base: Omit<ExecutiveActionPresenceDeferredDisposition, "outcome" | "reasonCode" | "state">,
  resolution: ExecutiveRequestResolution<unknown>,
  reasonCode: ExecutiveActionPresenceDeferredReasonCode,
  bindingAvailability: ExecutiveActionPresenceDeferredDisposition["state"]["bindingAvailability"],
): ExecutiveActionPresenceDeferredDisposition {
  return Object.freeze({
    ...base,
    outcome: "DEFERRED",
    reasonCode,
    state: Object.freeze({
      capabilityAuthorityOutcome: resolution.capabilityAuthority.outcome,
      capabilityAuthorityReason: resolution.capabilityAuthority.reason,
      bindingAvailability,
      candidateCapabilities: Object.freeze([...candidateCapabilities(resolution)]),
    }),
  });
}

function rejected(
  base: Omit<ExecutiveActionPresenceDisposition, "outcome">,
  reasonCode: ExecutiveActionPresenceRejectedReasonCode,
): ExecutiveActionPresenceDisposition {
  return Object.freeze({ ...base, outcome: "REJECTED", reasonCode });
}

function bindingFailureReason(
  failure: ExecutiveActionPresenceBindingResolutionFailure,
): ExecutiveActionPresenceDeferredReasonCode {
  const reasons = {
    NOT_FOUND: "BINDING_NOT_FOUND",
    UNAVAILABLE: "BINDING_UNAVAILABLE",
    NON_INVOCABLE: "BINDING_NON_INVOCABLE",
    INCOMPATIBLE: "BINDING_INCOMPATIBLE",
    RESOLUTION_FAILED: "BINDING_RESOLUTION_FAILED",
  } as const;
  return reasons[failure.reasonCode];
}

function bindingMatches(
  binding: ExecutiveActionPresenceBindingReference,
  capability: PrimaryResolvedCapability,
  strategy: string,
  mode: string,
): boolean {
  return binding.capabilityId === capability.capabilityId
    && binding.providerId === capability.providerId
    && binding.strategy === strategy
    && binding.mode === mode
    && binding.bindingId.trim().length > 0
    && binding.runtimeAdapterId.trim().length > 0
    && binding.version.trim().length > 0;
}

function isReadable(availability: ExecutiveActionPresenceBindingReference["availability"]): boolean {
  return availability === "AVAILABLE" || availability === "READ_ONLY";
}

function isBlocking(item: MissingInformation): item is Extract<MissingInformation, { blocking: true }> {
  return item.blocking;
}

function isNonBlocking(item: MissingInformation): item is Extract<MissingInformation, { blocking: false }> {
  return !item.blocking;
}
