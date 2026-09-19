import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";

import type { IntegrationProviderName } from "../integrations/connection-descriptors";

export type { IntegrationProviderName };

// BizimHesap's connection and its data preparation are two different
// facts: a proven credential (status CONNECTED) whose last sync failed is
// reported as SYNC_FAILED, never as a failed connection.
export type IntegrationSyncState =
  | "NOT_SYNCED_YET"
  | "SYNCED"
  | "SYNC_FAILED";

export type IntegrationStatusReality = {
  provider: IntegrationProviderName;
  connected: boolean;
  status: "CONNECTED" | "ERROR" | "DISCONNECTED";
  email: string | null;
  lastErrorCode: string | null;
} & (
  | { syncState?: undefined }
  | {
      syncState: IntegrationSyncState | null;
      lastSuccessfulSyncAt: string | null;
      lastErrorAt: string | null;
      // What the canonical Company Truth actually holds from this
      // provider (read back from the bindings, not from the sync result).
      syncedProducts: number;
      syncedWarehouses: number;
    }
);

export function deriveSyncState(connection: {
  status: string;
  lastSuccessfulSyncAt: Date | null;
  lastErrorAt: Date | null;
}): IntegrationSyncState | null {
  if (connection.status !== "CONNECTED") return null;

  if (
    connection.lastErrorAt &&
    (!connection.lastSuccessfulSyncAt ||
      connection.lastErrorAt > connection.lastSuccessfulSyncAt)
  ) {
    return "SYNC_FAILED";
  }

  return connection.lastSuccessfulSyncAt ? "SYNCED" : "NOT_SYNCED_YET";
}

/**
 * Generic, provider-parameterized status read over the existing
 * IntegrationConnection model — the same table BizimHesap's own status
 * route already reads, just exposed as a native conversational
 * capability instead of a Settings screen. Adding a second provider
 * later means adding one more value to IntegrationProviderName, never a
 * new table or a new capability.
 */
export async function lookupIntegrationStatus(
  input: {
    actorUserId: string;
    organizationId: string;
    provider: IntegrationProviderName;
  }
): Promise<IntegrationStatusReality> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  const connection = await db.integrationConnection.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: input.provider }
    },
    select: {
      status: true,
      lastErrorCode: true,
      lastSuccessfulSyncAt: true,
      lastErrorAt: true
    }
  });

  const base = {
    provider: input.provider,
    connected: connection?.status === "CONNECTED",
    status: connection?.status ?? "DISCONNECTED",
    lastErrorCode: connection?.lastErrorCode ?? null
  } as const;

  if (input.provider === "BIZIMHESAP") {
    const [syncedProducts, syncedWarehouses] = connection
      ? await Promise.all([
          db.externalSourceBinding.count({
            where: {
              organizationId,
              sourceSystem: "bizimhesap",
              resourceType: "ProductService"
            }
          }),
          db.externalSourceBinding.count({
            where: {
              organizationId,
              sourceSystem: "bizimhesap",
              resourceType: "Location"
            }
          })
        ])
      : [0, 0];

    return {
      ...base,
      email: null,
      syncState: connection ? deriveSyncState(connection) : null,
      lastSuccessfulSyncAt:
        connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastErrorAt: connection?.lastErrorAt?.toISOString() ?? null,
      syncedProducts,
      syncedWarehouses
    };
  }

  const email =
    connection?.status === "CONNECTED"
      ? (await loadNylasConnection(organizationId))?.email ?? null
      : null;

  return { ...base, email };
}
