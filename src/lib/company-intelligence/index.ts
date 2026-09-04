export * from "./types";
export * from "./source-registry";
export * from "./identity-resolution";
export * from "./identity-graph";
export * from "./truth-authority-resolution";
export * from "./truth-authority";
export * from "./connector-gateway";
export * from "./native-connector-adapter";
export * from "./native-source-bootstrap";
export * from "./company-intelligence";
export * from "./write-routing";
export * from "./telemetry";

import { ensureNativeConnectorAdapterRegistered } from "./native-source-bootstrap";

let bootstrapped = false;

/**
 * Registers the platform's process-wide (org-independent) pieces exactly
 * once — currently just the native connector adapter. Org-scoped pieces
 * (the native ConnectorSource row, canonical entity/identity records) are
 * deliberately not part of this: they're per-organization data, ensured
 * lazily wherever an organizationId is actually available (see
 * native-source-bootstrap.ts's ensureNativeSourceRegistered). Mirrors
 * canonical-operation/capabilities/index.ts's bootstrapCapabilityRegistry.
 */
export function bootstrapCompanyIntelligencePlatform(): void {
  if (bootstrapped) return;
  ensureNativeConnectorAdapterRegistered();
  bootstrapped = true;
}
