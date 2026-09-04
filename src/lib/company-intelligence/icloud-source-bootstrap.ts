import { getConnectorAdapter, registerConnectorAdapter } from "./connector-gateway";
import { icloudConnectorAdapter } from "./icloud-connector-adapter";
import { registerSource } from "./source-registry";
import type { ConnectorSourceDescriptor } from "./types";

const ICLOUD_SOURCE_KEY = "icloud";

/**
 * Idempotent upsert (see registerSource) — mirrors google-source-bootstrap.ts.
 * One ConnectorSource row per organization represents iCloud Calendar
 * capability presence declaratively; icloudConnectorAdapter.health is the
 * actual live signal, and IcloudConnection (per-user) is the real per-user
 * connection state.
 */
export async function ensureIcloudSourceRegistered(organizationId: string): Promise<ConnectorSourceDescriptor> {
  return registerSource({
    organizationId,
    sourceKey: ICLOUD_SOURCE_KEY,
    sourceType: "CALENDAR",
    provider: "ICLOUD",
    displayName: "iCloud Calendar",
    connectionMode: "MANUAL",
    capabilities: [{ id: "calendar.range", read: true, write: false }],
    // No authoritativeScopes entry, same reasoning as Google's calendar.range:
    // calendar is federated/additive across every capable, healthy source
    // (see calendar-projection.ts), never a single-winner Truth Authority pick.
    authoritativeScopes: [],
    status: "ACTIVE",
  });
}

/** Registers the adapter instance once per process — mirrors ensureGoogleConnectorAdapterRegistered. */
export function ensureIcloudConnectorAdapterRegistered(): void {
  if (!getConnectorAdapter("ICLOUD")) registerConnectorAdapter(icloudConnectorAdapter);
}
