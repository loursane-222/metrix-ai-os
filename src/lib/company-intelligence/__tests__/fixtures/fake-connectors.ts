import type { ConnectorAdapter, ConnectorReadRequest, ConnectorReadResult } from "../../types";

/**
 * A minimal, real ConnectorAdapter implementation used only by the
 * acceptance harness (see multi-source-acceptance.integration.test.ts) to
 * prove the platform's contracts are genuinely multi-source without writing
 * a real Logo/Parasut/HubSpot integration in this operation. Each fake
 * connector serves exactly one fact scope, by external entity id, from an
 * in-memory map the test controls.
 */
export function createFakeReadConnector(params: {
  readonly provider: string;
  readonly displayName: string;
  readonly factScope: string;
  readonly valuesByExternalEntityId: Readonly<Record<string, unknown>>;
}): ConnectorAdapter {
  return {
    provider: params.provider,
    displayName: params.displayName,
    supportedCapabilities: [params.factScope],
    async health() {
      return { status: "HEALTHY", checkedAt: new Date().toISOString() };
    },
    async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
      const observedAt = new Date().toISOString();
      if (request.factScope !== params.factScope) return { status: "UNSUPPORTED", observedAt };
      if (!request.externalEntityId) return { status: "UNSUPPORTED", observedAt };
      const value = params.valuesByExternalEntityId[request.externalEntityId];
      if (value === undefined) return { status: "NOT_FOUND", observedAt };
      return { status: "OK", value, observedAt };
    },
  };
}
