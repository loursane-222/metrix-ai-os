import { requireOrganizationAccess } from "../auth/organization-access";
import { loadNylasConnection } from "../integrations/nylas/nylas-connection";

import type { IntegrationProviderName } from "../data/integration-status";

export type IntegrationConnectResult =
  | {
      provider: IntegrationProviderName;
      alreadyConnected: true;
      email: string | null;
    }
  | {
      provider: IntegrationProviderName;
      alreadyConnected: false;
      title: string;
      description: string;
      connectUrl: string;
    };

const CONNECT_ACTION_BY_PROVIDER: Record<
  IntegrationProviderName,
  { title: string; description: string; connectUrl: string }
> = {
  NYLAS: {
    title: "Google Hesabını Bağla",
    description:
      "Gmail ve Google Takvim'e erişim için Google'ın kendi izin ekranı açılacak. Yalnız izin verdiğin erişim alanları kullanılır.",
    connectUrl: "/api/integrations/nylas/connect"
  }
};

/**
 * Never asks a provider for a URL and never lets the model construct
 * one — the connect action is a fixed, deterministic descriptor of one
 * of NEXT's own routes (see CONNECT_ACTION_BY_PROVIDER). That route,
 * not this function, is what actually talks to the provider/Nylas and
 * requires real credentials — so this stays fully usable with no
 * external account configured yet, and only fails to be USEFUL (not to
 * run) until one exists.
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

  const existing = await loadNylasConnection(organizationId);

  if (existing) {
    return { provider: input.provider, alreadyConnected: true, email: existing.email };
  }

  return {
    provider: input.provider,
    alreadyConnected: false,
    ...CONNECT_ACTION_BY_PROVIDER[input.provider]
  };
}
