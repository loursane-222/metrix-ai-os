import { actionRegistry } from "@/lib/action-runtime/registry";
import type { ActionDefinition } from "@/lib/action-runtime/registry";
import type { RuntimeRiskContext } from "@/lib/action-runtime/policy";

export type CapabilityClassification = "READ" | "WRITE" | "NAVIGATION";

export type CapabilityReadImplementation = {
  readonly kind: "READ";
  /** organizationId + entityId -> the canonical entity, or null if not found. */
  readonly read: (organizationId: string, entityId: string) => Promise<Record<string, unknown> | null>;
  /** organizationId + capability-specific query payload -> a list/result. */
  readonly search?: (organizationId: string, payload: Record<string, unknown>) => Promise<unknown>;
};

export type CapabilityWriteImplementation = {
  readonly kind: "WRITE";
  /** The real, already-registered action-runtime actionName this capability executes. */
  readonly nativeActionName: string;
  /** Capability payload -> the entityRef the executed action targets, if known ahead of execution. */
  readonly resolveEntityRef?: (payload: Record<string, unknown>) => { entityType: string; entityId: string } | undefined;
  /**
   * Optional stronger readback: capability-specific payload + the freshly
   * re-read entity -> a mismatch summary, or null when the read state
   * matches what the operation asked for. Capabilities without this use
   * existence-only structural readback (see native-connector.ts).
   */
  readonly verifyExpectedState?: (payload: Record<string, unknown>, readEntity: Record<string, unknown>) => string | null;
  /** The paired read capability id used for post-write readback, e.g. "customer.read". */
  readonly readbackCapability?: string;
  /** Static runtime risk context, for actions whose risk doesn't depend on payload (e.g. quote.send). */
  readonly runtimeRiskContext?: RuntimeRiskContext;
  /** Payload-derived runtime risk context (e.g. customer.update's changed-fields risk) — mirrors the real gateway's own risk builder. */
  readonly resolveRuntimeRiskContext?: (payload: Record<string, unknown>) => RuntimeRiskContext;
};

export type CapabilityNavigationImplementation = {
  readonly kind: "NAVIGATION";
  readonly route: string;
};

export type CapabilityImplementation =
  | CapabilityReadImplementation
  | CapabilityWriteImplementation
  | CapabilityNavigationImplementation;

export type CapabilityDescriptor = {
  readonly capabilityId: string;
  readonly domain: string;
  readonly classification: CapabilityClassification;
  readonly implementation: CapabilityImplementation;
};

const registry = new Map<string, CapabilityDescriptor>();

export function registerCapability(descriptor: CapabilityDescriptor): void {
  if (registry.has(descriptor.capabilityId)) {
    throw new Error(`Capability "${descriptor.capabilityId}" is already registered.`);
  }
  registry.set(descriptor.capabilityId, descriptor);
}

export function getCapability(capabilityId: string): CapabilityDescriptor | undefined {
  return registry.get(capabilityId);
}

export function listCapabilities(): readonly CapabilityDescriptor[] {
  return Array.from(registry.values());
}

export function listCapabilitiesByDomain(domain: string): readonly CapabilityDescriptor[] {
  return listCapabilities().filter((descriptor) => descriptor.domain === domain);
}

/**
 * Looks up the real ActionDefinition backing a WRITE capability. Throws if
 * the capability names an action the registry doesn't actually have —
 * fabricated capabilities are a registration-time bug, not a runtime state.
 */
export function resolveNativeActionDefinition(descriptor: CapabilityDescriptor): ActionDefinition {
  if (descriptor.implementation.kind !== "WRITE") {
    throw new Error(`Capability "${descriptor.capabilityId}" is not a WRITE capability.`);
  }
  return actionRegistry.getActionDefinition(descriptor.implementation.nativeActionName);
}

/** Test-only: clears all registrations so suites don't leak state across files. */
export function resetCapabilityRegistryForTests(): void {
  registry.clear();
}
