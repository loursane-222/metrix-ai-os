import { db } from "../../db";
import { decryptSecret } from "../credential-crypto";

export type NylasConnectionInfo = {
  grantId: string;
  email: string | null;
  provider: string | null;
};

/**
 * Loads the organization's connected Nylas grant, or null if none is
 * connected/CONNECTED — every caller (mail search, mail send, external
 * calendar read) treats "not connected" as a graceful, empty reality,
 * never an error, exactly like an organization with no BizimHesap
 * connection sees no synced catalog.
 */
export async function loadNylasConnection(
  organizationId: string
): Promise<NylasConnectionInfo | null> {
  const connection = await db.integrationConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "NYLAS"
      }
    },
    select: { status: true, credentialsEncrypted: true }
  });

  if (!connection || connection.status !== "CONNECTED") {
    return null;
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(decryptSecret(connection.credentialsEncrypted));
  } catch {
    return null;
  }

  if (typeof decoded !== "object" || decoded === null) {
    return null;
  }

  const record = decoded as Record<string, unknown>;
  const grantId = record.grantId;

  if (typeof grantId !== "string" || grantId.trim().length === 0) {
    return null;
  }

  return {
    grantId,
    email: typeof record.email === "string" ? record.email : null,
    provider: typeof record.provider === "string" ? record.provider : null
  };
}
