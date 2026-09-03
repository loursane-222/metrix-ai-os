import { actionRegistry } from "@/lib/action-runtime/registry";
import { getCapability, registerCapability } from "../capability-registry";

/**
 * Full-coverage fallback: every real, already-registered DOMAIN action in
 * the action-runtime registry that doesn't already have a curated
 * business-semantic capability (see write-capabilities.ts) gets one
 * auto-registered here, using its own actionName as the capability id
 * (already a business-semantic name, e.g. "delivery.create",
 * "goal.archive" — not renamed). This closes the gap between "registered
 * in Action Registry" and "reachable through the Universal Capability
 * Registry" for the ~40+ production actions outside the nine curated
 * representative domains, without fabricating any new capability: nothing
 * here is registered unless actionRegistry already has a real handler for
 * it. Curated entries always win (never overwritten) because they carry
 * richer readback/risk-context wiring.
 */
export function registerAutoDiscoveredWriteCapabilities(): void {
  for (const definition of actionRegistry.listActionsByClass("DOMAIN")) {
    if (getCapability(definition.actionName)) continue;
    registerCapability({
      capabilityId: definition.actionName,
      domain: definition.ownerModule,
      classification: "WRITE",
      implementation: { kind: "WRITE", nativeActionName: definition.actionName },
    });
  }
}
