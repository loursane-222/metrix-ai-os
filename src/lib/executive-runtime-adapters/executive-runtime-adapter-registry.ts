import type {
  ExecutiveRuntimeAdapter,
  ExecutiveRuntimeAdapterDescriptor,
  ExecutiveRuntimeAdapterRegistry,
} from "./contracts";
import {
  DuplicateExecutiveRuntimeAdapterError,
  ExecutiveRuntimeAdapterContractError,
} from "./executive-runtime-adapter.errors";

/**
 * Maps stable adapter contract IDs to adapter instances only. It never selects
 * capabilities, actions, handlers, permissions, policy, or approval outcomes.
 */
export function createExecutiveRuntimeAdapterRegistry(): ExecutiveRuntimeAdapterRegistry {
  const adapters = new Map<string, ExecutiveRuntimeAdapter>();

  return Object.freeze({
    register(adapter: ExecutiveRuntimeAdapter): void {
      const registered = snapshotAdapter(adapter);
      if (adapters.has(registered.descriptor.adapterId)) {
        throw new DuplicateExecutiveRuntimeAdapterError(registered.descriptor.adapterId);
      }
      adapters.set(registered.descriptor.adapterId, registered);
    },

    unregister(adapterId: string): boolean {
      return adapters.delete(adapterId);
    },

    get(adapterId: string): ExecutiveRuntimeAdapter | null {
      return adapters.get(adapterId) ?? null;
    },

    has(adapterId: string): boolean {
      return adapters.has(adapterId);
    },

    list(): readonly ExecutiveRuntimeAdapter[] {
      return Object.freeze(
        [...adapters.values()].sort((left, right) =>
          left.descriptor.adapterId.localeCompare(right.descriptor.adapterId),
        ),
      );
    },
  });
}

function snapshotAdapter(adapter: ExecutiveRuntimeAdapter): ExecutiveRuntimeAdapter {
  if (!adapter || typeof adapter !== "object") {
    throw new ExecutiveRuntimeAdapterContractError("adapter", "Adapter must be an object.");
  }
  if (typeof adapter.canHandle !== "function") {
    throw new ExecutiveRuntimeAdapterContractError("canHandle", "Adapter must provide canHandle().");
  }
  const descriptor = snapshotDescriptor(adapter.descriptor);
  return Object.freeze({
    descriptor,
    canHandle: adapter.canHandle.bind(adapter),
  });
}

function snapshotDescriptor(descriptor: ExecutiveRuntimeAdapterDescriptor): ExecutiveRuntimeAdapterDescriptor {
  if (!descriptor || typeof descriptor !== "object") {
    throw new ExecutiveRuntimeAdapterContractError("descriptor", "Descriptor must be an object.");
  }
  assertNonEmpty(descriptor.adapterId, "adapterId");
  assertNonEmpty(descriptor.ownerBoundary, "ownerBoundary");
  assertNonEmpty(descriptor.version, "version");
  assertStringList(descriptor.supportedCapabilities, "supportedCapabilities");
  assertStringList(descriptor.supportedStrategies, "supportedStrategies");
  assertStringList(descriptor.supportedModes, "supportedModes");
  if (![
    "AVAILABLE",
    "READ_ONLY",
    "DECLARED_NOT_EXECUTABLE",
    "UNAVAILABLE",
  ].includes(descriptor.availability)) {
    throw new ExecutiveRuntimeAdapterContractError("availability", "Adapter availability is invalid.");
  }

  return Object.freeze({
    adapterId: descriptor.adapterId,
    ownerBoundary: descriptor.ownerBoundary,
    version: descriptor.version,
    supportedCapabilities: Object.freeze([...descriptor.supportedCapabilities]),
    supportedStrategies: Object.freeze([...descriptor.supportedStrategies]),
    supportedModes: Object.freeze([...descriptor.supportedModes]),
    availability: descriptor.availability,
  });
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ExecutiveRuntimeAdapterContractError(field, `${field} must be a non-empty string.`);
  }
}

function assertStringList(values: readonly string[], field: string): void {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new ExecutiveRuntimeAdapterContractError(field, `${field} must contain non-empty strings.`);
  }
}
