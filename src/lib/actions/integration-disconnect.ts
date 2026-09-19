import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";

import type { IntegrationProviderName } from "../data/integration-status";

export type IntegrationDisconnectResult = {
  provider: IntegrationProviderName;
  disconnected: boolean;
};

/**
 * Marks the connection DISCONNECTED (capabilities that check
 * loadNylasConnection stop finding it immediately) without deleting the
 * encrypted grant row — a later reconnect overwrites it the same way
 * connect already does, and nothing here ever revokes access on the
 * provider's own side (out of this operation's scope).
 */
export async function executeIntegrationDisconnect(
  input: {
    actorUserId: string;
    organizationId: string;
    provider: IntegrationProviderName;
  }
): Promise<IntegrationDisconnectResult> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  const updated = await db.integrationConnection.updateMany({
    where: { organizationId, provider: input.provider },
    data: { status: "DISCONNECTED" }
  });

  return { provider: input.provider, disconnected: updated.count > 0 };
}
