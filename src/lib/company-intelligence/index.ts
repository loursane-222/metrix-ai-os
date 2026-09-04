export * from "./types";
export * from "./source-registry";
export * from "./identity-resolution";
export * from "./identity-graph";
export * from "./truth-authority-resolution";
export * from "./truth-authority";
export * from "./connector-gateway";
export * from "./native-connector-adapter";
export * from "./native-source-bootstrap";
export * from "./google-connector-adapter";
export * from "./google-source-bootstrap";
export * from "./icloud-connector-adapter";
export * from "./icloud-source-bootstrap";
export * from "./google-evidence-need";
export * from "./google-evidence";
export * from "./company-intelligence";
export * from "./write-routing";
export * from "./telemetry";

import { ensureNativeConnectorAdapterRegistered } from "./native-source-bootstrap";
import { ensureGoogleConnectorAdapterRegistered } from "./google-source-bootstrap";
import { ensureIcloudConnectorAdapterRegistered } from "./icloud-source-bootstrap";

let bootstrapped = false;

/**
 * Registers the platform's process-wide (org-independent) pieces exactly
 * once — currently the native and Google connector adapters. Org-scoped
 * pieces (ConnectorSource rows, canonical entity/identity records) are
 * deliberately not part of this: they're per-organization data, ensured
 * lazily wherever an organizationId is actually available (see
 * native-source-bootstrap.ts's ensureNativeSourceRegistered and
 * google-source-bootstrap.ts's ensureGoogleSourceRegistered). Mirrors
 * canonical-operation/capabilities/index.ts's bootstrapCapabilityRegistry.
 */
export function bootstrapCompanyIntelligencePlatform(): void {
  if (bootstrapped) return;
  ensureNativeConnectorAdapterRegistered();
  ensureGoogleConnectorAdapterRegistered();
  ensureIcloudConnectorAdapterRegistered();
  bootstrapped = true;
}
