import { getConnectorAdapter, registerConnectorAdapter } from "./connector-gateway";
import { googleConnectorAdapter } from "./google-connector-adapter";
import { registerSource } from "./source-registry";
import type { ConnectorSourceDescriptor } from "./types";

const GOOGLE_SOURCE_KEY = "google";

/**
 * Idempotent upsert (see registerSource) — same pattern as
 * native-source-bootstrap.ts's ensureNativeSourceRegistered. One
 * ConnectorSource row per organization represents the org's Google
 * connection as a whole (Gmail + Calendar together); it is declarative
 * capability presence, not a live-connection guarantee — see
 * googleConnectorAdapter.health for the actual live signal, and
 * GmailConnection (per-user) for the real per-user OAuth state.
 */
export async function ensureGoogleSourceRegistered(organizationId: string): Promise<ConnectorSourceDescriptor> {
  return registerSource({
    organizationId,
    sourceKey: GOOGLE_SOURCE_KEY,
    sourceType: "EMAIL_CALENDAR",
    provider: "GOOGLE",
    displayName: "Google (Gmail + Calendar)",
    connectionMode: "OAUTH",
    capabilities: [
      { id: "email.recentMessages", read: true, write: false },
      { id: "calendar.upcomingEvents", read: true, write: false },
    ],
    // No other source can ever produce these two fact scopes (native METRIX
    // has no email/external-calendar data of its own), so Google is
    // unconditionally PRIMARY for READ — write is never declared here at
    // all, which is what makes write-routing.ts's resolveWriteRoute return
    // NO_AUTHORITY for these scopes rather than routing anywhere.
    authoritativeScopes: [
      { factScope: "email.recentMessages", role: "PRIMARY", applicability: "READ" },
      { factScope: "calendar.upcomingEvents", role: "PRIMARY", applicability: "READ" },
    ],
    status: "ACTIVE",
  });
}

/** Registers the adapter instance once per process — mirrors ensureNativeConnectorAdapterRegistered. */
export function ensureGoogleConnectorAdapterRegistered(): void {
  if (!getConnectorAdapter("GOOGLE")) registerConnectorAdapter(googleConnectorAdapter);
}
