import type { ConnectorAdapter, ConnectorProvider } from "./types";

/**
 * Runtime registry of ConnectorAdapter implementations, keyed by provider —
 * adapters are code (one instance serves every organization), unlike
 * ConnectorSource rows in source-registry.ts, which are per-organization
 * data. Mirrors canonical-operation/capability-registry.ts's registration
 * pattern deliberately, for the same reason: a small, explicit, in-memory
 * map of already-typed implementations, not a dynamic plugin loader.
 */
const registry = new Map<ConnectorProvider, ConnectorAdapter>();

export function registerConnectorAdapter(adapter: ConnectorAdapter): void {
  if (registry.has(adapter.provider)) {
    throw new Error(`Connector adapter for provider "${adapter.provider}" is already registered.`);
  }
  registry.set(adapter.provider, adapter);
}

export function getConnectorAdapter(provider: ConnectorProvider): ConnectorAdapter | undefined {
  return registry.get(provider);
}

export function listConnectorAdapters(): readonly ConnectorAdapter[] {
  return Array.from(registry.values());
}

/** Test-only: clears all registrations so suites don't leak state across files. */
export function resetConnectorGatewayForTests(): void {
  registry.clear();
}
