import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";

export type IntegrationProviderName = "NYLAS";

export type IntegrationStatusReality = {
  provider: IntegrationProviderName;
  connected: boolean;
  status: "CONNECTED" | "ERROR" | "DISCONNECTED";
  email: string | null;
  lastErrorCode: string | null;
};

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
    select: { status: true, lastErrorCode: true }
  });

  const email =
    connection?.status === "CONNECTED"
      ? (await loadNylasConnection(organizationId))?.email ?? null
      : null;

  return {
    provider: input.provider,
    connected: connection?.status === "CONNECTED",
    status: connection?.status ?? "DISCONNECTED",
    email,
    lastErrorCode: connection?.lastErrorCode ?? null
  };
}
