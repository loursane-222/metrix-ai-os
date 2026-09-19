import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { encryptSecret } from "../integrations/credential-crypto";
import {
  NylasRequestError,
  nylasExchangeCodeForGrant,
  nylasGetGrant,
  type FetchLike
} from "../integrations/nylas/nylas-client";

export class NylasConnectionFailedError extends Error {
  readonly code = "NYLAS_CONNECTION_FAILED";

  constructor() {
    super("Could not exchange the Nylas authorization code for a grant");
    this.name = "NylasConnectionFailedError";
  }
}

export type NylasConnectInput = {
  actorUserId: string;
  organizationId: string;
  code: string;
  redirectUri: string;
};

export type NylasConnectResult = {
  status: "CONNECTED";
  email: string | null;
  provider: string | null;
};

function extractText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Exchanges the Hosted Authentication callback's one-time `code` for a
 * grant, reads the connected account's own identity from Nylas, and
 * persists only the grant_id (+ email/provider label for display) —
 * never a raw provider access token, since Nylas itself holds and
 * refreshes that. Same encrypt-at-rest, fail-closed-on-error shape as
 * bizimhesap-connect.ts.
 */
export async function executeNylasConnect(
  input: NylasConnectInput,
  fetchImpl?: FetchLike
): Promise<NylasConnectResult> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const code = input.code.trim();
  const redirectUri = input.redirectUri.trim();

  if (!actorUserId || !organizationId || !code || !redirectUri) {
    throw new NylasConnectionFailedError();
  }

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  try {
    const { grantId } = await nylasExchangeCodeForGrant(
      { code, redirectUri },
      fetchImpl
    );

    const grant = await nylasGetGrant(grantId, fetchImpl);
    const email = extractText(grant, "email");
    const provider = extractText(grant, "provider");

    await db.integrationConnection.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "NYLAS"
        }
      },
      create: {
        organizationId,
        provider: "NYLAS",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId, email, provider })
        ),
        status: "CONNECTED"
      },
      update: {
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId, email, provider })
        ),
        status: "CONNECTED",
        lastErrorAt: null,
        lastErrorCode: null
      }
    });

    return { status: "CONNECTED", email, provider };
  } catch (error) {
    if (!(error instanceof NylasRequestError)) {
      // MissingNylasCredentialsError or a network-level throw is a real-
      // connection prerequisite/config problem, not a bad callback — do
      // not mask it, and do not persist anything.
      throw error;
    }

    await db.integrationConnection.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "NYLAS"
        }
      },
      create: {
        organizationId,
        provider: "NYLAS",
        credentialsEncrypted: encryptSecret(JSON.stringify({})),
        status: "ERROR",
        lastErrorAt: new Date(),
        lastErrorCode: error.code
      },
      update: {
        status: "ERROR",
        lastErrorAt: new Date(),
        lastErrorCode: error.code
      }
    });

    throw new NylasConnectionFailedError();
  }
}
