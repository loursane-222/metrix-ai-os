import { requireOrganizationAccess } from "../auth/organization-access";
import { lookupIntegrationStatus } from "../data/integration-status";
import {
  CONNECTION_DESCRIPTORS,
  type IntegrationProviderName,
  type SecureCredentialConnectionDescriptor
} from "../integrations/connection-descriptors";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";
import { executeBizimHesapSync } from "./bizimhesap-sync";

export type IntegrationConnectResult =
  | {
      provider: IntegrationProviderName;
      alreadyConnected: true;
      email: string | null;
      // Set only for a provider whose connection includes a data
      // preparation (sync) step: where that step stands after this call.
      syncState?: "NOT_SYNCED_YET" | "SYNCED" | "SYNC_FAILED" | null;
    }
  | {
      provider: IntegrationProviderName;
      alreadyConnected: false;
      title: string;
      description: string;
      connectUrl: string;
    }
  | ({
      provider: IntegrationProviderName;
      alreadyConnected: false;
      connectionMethod: "SECURE_CREDENTIAL";
    } & Omit<SecureCredentialConnectionDescriptor, "method">);

/**
 * Never asks a provider for a URL and never lets the model construct
 * one — the connect action is a fixed, deterministic descriptor (see
 * CONNECTION_DESCRIPTORS): either one of NEXT's own OAuth start routes, or
 * a secure credential entry that posts to one of NEXT's own routes. Those
 * routes, not this function, talk to the provider — so this stays fully
 * usable with no external account configured yet, and only fails to be
 * USEFUL (not to run) until one exists. It never receives or returns a
 * secret.
 */
export async function executeIntegrationConnect(
  input: {
    actorUserId: string;
    organizationId: string;
    provider: IntegrationProviderName;
  }
): Promise<IntegrationConnectResult> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  const descriptor = CONNECTION_DESCRIPTORS[input.provider];

  if (descriptor.method === "OAUTH") {
    const existing = await loadNylasConnection(organizationId);

    if (existing) {
      return {
        provider: input.provider,
        alreadyConnected: true,
        email: existing.email
      };
    }

    const { method: _method, ...connectAction } = descriptor;

    return {
      provider: input.provider,
      alreadyConnected: false,
      ...connectAction
    };
  }

  const status = await lookupIntegrationStatus({
    actorUserId,
    organizationId,
    provider: input.provider
  });

  if (status.connected) {
    let syncState = status.syncState ?? null;

    // Connected but the data preparation never completed (or failed): the
    // connection lifecycle is not finished, so finishing it is part of
    // "connect". It is the same idempotent sync the connect route runs; a
    // failure is reported as SYNC_FAILED, not thrown.
    if (syncState === "NOT_SYNCED_YET" || syncState === "SYNC_FAILED") {
      try {
        await executeBizimHesapSync({ actorUserId, organizationId });
        syncState = "SYNCED";
      } catch {
        syncState = "SYNC_FAILED";
      }
    }

    return {
      provider: input.provider,
      alreadyConnected: true,
      email: null,
      syncState
    };
  }

  const { method: _method, ...secureAction } = descriptor;

  return {
    provider: input.provider,
    alreadyConnected: false,
    connectionMethod: "SECURE_CREDENTIAL",
    ...secureAction
  };
}
