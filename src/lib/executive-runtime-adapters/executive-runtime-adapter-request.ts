import type {
  ExecutiveActionPresenceActionPlanDisposition,
  ExecutiveActionPresenceDisposition,
  ExecutiveActionPresencePageContext,
} from "../executive-action-presence";
import type {
  CreateExecutiveRuntimeAdapterRequestMetadata,
  ExecutiveRuntimeAdapterRequest,
} from "./contracts";
import { ExecutiveRuntimeAdapterMapperError } from "./executive-runtime-adapter.errors";

export function createExecutiveRuntimeAdapterRequest(
  disposition: ExecutiveActionPresenceDisposition,
  metadata: CreateExecutiveRuntimeAdapterRequestMetadata,
): ExecutiveRuntimeAdapterRequest {
  if (disposition.outcome !== "ACTION_PLAN_REQUIRED") {
    throw new ExecutiveRuntimeAdapterMapperError(
      "ACTION_PLAN_REQUIRED",
      "Only ACTION_PLAN_REQUIRED can cross the runtime adapter boundary.",
    );
  }
  assertMetadata(metadata);
  assertActionPlan(disposition);
  const runtimeAdapterId = disposition.runtimeAdapterId;
  if (typeof runtimeAdapterId !== "string" || runtimeAdapterId.trim().length === 0) {
    throw new ExecutiveRuntimeAdapterMapperError(
      "RUNTIME_ADAPTER_ID",
      "ACTION_PLAN_REQUIRED must contain a runtime adapter ID.",
    );
  }

  return Object.freeze({
    requestId: disposition.requestId,
    organizationId: disposition.organizationId,
    channel: metadata.channel,
    runtimeAdapterId,
    primaryCapability: disposition.primaryCapability,
    binding: disposition.binding,
    intendedStrategy: disposition.intendedStrategy,
    intendedMode: disposition.intendedMode,
    requiredContexts: Object.freeze([...disposition.requiredContexts]),
    resolvedEntities: Object.freeze([...disposition.resolvedEntities]),
    missingInformation: Object.freeze([...disposition.missingInformation]),
    pageContext: snapshotPageContext(disposition.pageContext),
    occurredAt: metadata.occurredAt,
    presenceGeneratedAt: disposition.generatedAt,
    correlationReference: Object.freeze({ ...metadata.correlationReference }),
  });
}

function assertActionPlan(disposition: ExecutiveActionPresenceActionPlanDisposition): void {
  if (
    disposition.binding.runtimeAdapterId !== disposition.runtimeAdapterId
    || disposition.binding.capabilityId !== disposition.primaryCapability.capabilityId
    || disposition.binding.providerId !== disposition.primaryCapability.providerId
    || disposition.binding.strategy !== disposition.intendedStrategy
    || disposition.binding.mode !== disposition.intendedMode
  ) {
    throw new ExecutiveRuntimeAdapterMapperError(
      "BINDING_MISMATCH",
      "ACTION_PLAN_REQUIRED binding references must remain internally consistent.",
    );
  }
}

function assertMetadata(metadata: CreateExecutiveRuntimeAdapterRequestMetadata): void {
  if (!metadata || (metadata.channel !== "text" && metadata.channel !== "voice")) {
    throw new ExecutiveRuntimeAdapterMapperError("INVALID_METADATA", "A valid channel is required.");
  }
  if (typeof metadata.occurredAt !== "string" || Number.isNaN(Date.parse(metadata.occurredAt))) {
    throw new ExecutiveRuntimeAdapterMapperError("INVALID_METADATA", "A valid occurredAt timestamp is required.");
  }
  if (
    !metadata.correlationReference
    || typeof metadata.correlationReference.correlationId !== "string"
    || metadata.correlationReference.correlationId.trim().length === 0
    || typeof metadata.correlationReference.source !== "string"
    || metadata.correlationReference.source.trim().length === 0
  ) {
    throw new ExecutiveRuntimeAdapterMapperError("INVALID_METADATA", "A valid correlation reference is required.");
  }
}

function snapshotPageContext(
  context: ExecutiveActionPresencePageContext | null,
): ExecutiveActionPresencePageContext | null {
  if (!context) return null;
  return Object.freeze({
    ...context,
    selection: Object.freeze([...context.selection]),
  });
}
