import type {
  ExecutiveRuntimeAdapterClock,
  ExecutiveRuntimeAdapterDispatchResult,
  ExecutiveRuntimeAdapterDispatcher,
  ExecutiveRuntimeAdapterRegistry,
  ExecutiveRuntimeAdapterRequest,
} from "./contracts";
import { ExecutiveRuntimeAdapterContractError } from "./executive-runtime-adapter.errors";

export type ExecutiveRuntimeAdapterDispatcherDependencies = Readonly<{
  registry: ExecutiveRuntimeAdapterRegistry;
  clock: ExecutiveRuntimeAdapterClock;
}>;

export function createExecutiveRuntimeAdapterDispatcher(
  dependencies: ExecutiveRuntimeAdapterDispatcherDependencies,
): ExecutiveRuntimeAdapterDispatcher {
  if (!dependencies?.registry || typeof dependencies.registry.get !== "function") {
    throw new ExecutiveRuntimeAdapterContractError("registry", "An adapter registry is required.");
  }
  if (!dependencies.clock || typeof dependencies.clock.now !== "function") {
    throw new ExecutiveRuntimeAdapterContractError("clock", "A dispatcher clock is required.");
  }

  return Object.freeze({
    async dispatch(request: ExecutiveRuntimeAdapterRequest): Promise<ExecutiveRuntimeAdapterDispatchResult> {
      const generatedAt = dependencies.clock.now().toISOString();
      const base = {
        adapterId: typeof request?.runtimeAdapterId === "string" ? request.runtimeAdapterId : "",
        requestId: typeof request?.requestId === "string" ? request.requestId : "",
        organizationId: typeof request?.organizationId === "string" ? request.organizationId : "",
        generatedAt,
      } as const;

      if (!isValidRequestShape(request)) {
        return Object.freeze({ ...base, status: "REJECTED", reasonCode: "INVALID_INPUT" });
      }
      if (
        request.binding.runtimeAdapterId !== request.runtimeAdapterId
        || request.binding.capabilityId !== request.primaryCapability.capabilityId
        || request.binding.providerId !== request.primaryCapability.providerId
        || request.binding.strategy !== request.intendedStrategy
        || request.binding.mode !== request.intendedMode
      ) {
        return Object.freeze({ ...base, status: "REJECTED", reasonCode: "BINDING_MISMATCH" });
      }

      const adapter = dependencies.registry.get(request.runtimeAdapterId);
      if (!adapter) return Object.freeze({ ...base, status: "NOT_FOUND" });

      const { descriptor } = adapter;
      if (descriptor.adapterId !== request.runtimeAdapterId) {
        return Object.freeze({ ...base, status: "REJECTED", reasonCode: "BINDING_MISMATCH" });
      }
      if (descriptor.availability === "UNAVAILABLE") {
        return Object.freeze({ ...base, status: "UNAVAILABLE", availability: "UNAVAILABLE" });
      }
      if (descriptor.availability === "DECLARED_NOT_EXECUTABLE") {
        return Object.freeze({
          ...base,
          status: "NON_INVOCABLE",
          availability: "DECLARED_NOT_EXECUTABLE",
        });
      }
      if (
        descriptor.availability === "READ_ONLY"
        && (request.intendedMode === "DRAFT" || request.intendedMode === "EXECUTE")
      ) {
        return Object.freeze({ ...base, status: "NON_INVOCABLE", availability: "READ_ONLY" });
      }
      if (!descriptor.supportedCapabilities.includes(request.primaryCapability.capabilityId)) {
        return incompatible(base, "CAPABILITY");
      }
      if (!descriptor.supportedStrategies.includes(request.intendedStrategy)) {
        return incompatible(base, "STRATEGY");
      }
      if (!descriptor.supportedModes.includes(request.intendedMode)) {
        return incompatible(base, "MODE");
      }

      let accepted: boolean;
      try {
        accepted = await adapter.canHandle(request);
      } catch {
        return Object.freeze({
          ...base,
          status: "REJECTED",
          reasonCode: "ADAPTER_EVALUATION_FAILED",
        });
      }
      if (!accepted) return incompatible(base, "ADAPTER_DECLINED");

      return Object.freeze({
        status: "READY",
        adapterId: descriptor.adapterId,
        ownerBoundary: descriptor.ownerBoundary,
        version: descriptor.version,
        requestId: request.requestId,
        organizationId: request.organizationId,
        capabilityId: request.primaryCapability.capabilityId,
        providerId: request.primaryCapability.providerId,
        intendedStrategy: request.intendedStrategy,
        intendedMode: request.intendedMode,
        pageContextAvailable: request.pageContext !== null,
        generatedAt,
        correlationReference: request.correlationReference,
      });
    },
  });
}

function isValidRequestShape(request: ExecutiveRuntimeAdapterRequest): boolean {
  return !!request
    && nonEmpty(request.requestId)
    && nonEmpty(request.organizationId)
    && nonEmpty(request.runtimeAdapterId)
    && nonEmpty(request.primaryCapability?.capabilityId)
    && nonEmpty(request.primaryCapability?.providerId)
    && !!request.binding
    && nonEmpty(request.intendedStrategy)
    && nonEmpty(request.intendedMode)
    && (request.channel === "text" || request.channel === "voice")
    && Array.isArray(request.requiredContexts)
    && Array.isArray(request.resolvedEntities)
    && Array.isArray(request.missingInformation)
    && nonEmpty(request.occurredAt)
    && nonEmpty(request.presenceGeneratedAt)
    && nonEmpty(request.correlationReference?.correlationId)
    && nonEmpty(request.correlationReference?.source);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function incompatible(
  base: Readonly<{ adapterId: string; requestId: string; organizationId: string; generatedAt: string }>,
  reasonCode: "CAPABILITY" | "STRATEGY" | "MODE" | "ADAPTER_DECLINED",
): ExecutiveRuntimeAdapterDispatchResult {
  return Object.freeze({ ...base, status: "INCOMPATIBLE", reasonCode });
}
