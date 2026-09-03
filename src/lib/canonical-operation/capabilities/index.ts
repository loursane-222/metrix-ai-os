import { registerReadCapabilities } from "./read-capabilities";
import { registerWriteCapabilities } from "./write-capabilities";
import { registerNavigationCapabilities } from "./navigation-capabilities";
import { registerCompanyQueryCapability } from "./company-query-capability";
import { registerAutoDiscoveredWriteCapabilities } from "./auto-write-capabilities";

let bootstrapped = false;

/**
 * Registers every capability exactly once. Safe to call repeatedly (e.g.
 * from multiple route modules importing the capability registry) — only
 * the first call has an effect. Order matters: curated capabilities
 * register first so registerAutoDiscoveredWriteCapabilities (full-registry
 * fallback coverage) never overwrites a curated, richer-wired entry.
 */
export function bootstrapCapabilityRegistry(): void {
  if (bootstrapped) return;
  registerReadCapabilities();
  registerWriteCapabilities();
  registerNavigationCapabilities();
  registerCompanyQueryCapability();
  registerAutoDiscoveredWriteCapabilities();
  bootstrapped = true;
}
