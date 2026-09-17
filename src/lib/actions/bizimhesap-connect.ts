import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { encryptSecret } from "../integrations/credential-crypto";
import {
  BizimHesapRequestError,
  type FetchLike,
  bizimHesapVerifyCredentials
} from "../integrations/bizimhesap/bizimhesap-client";

const ConnectInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  token: z.string().trim().min(1),
  firmId: z.string().trim().min(1).optional()
});

export type BizimHesapConnectInput = z.input<typeof ConnectInputSchema>;

export class BizimHesapConnectionFailedError extends Error {
  readonly code = "BIZIMHESAP_CONNECTION_FAILED";

  constructor() {
    super("Could not verify BizimHesap credentials");
    this.name = "BizimHesapConnectionFailedError";
  }
}

export type BizimHesapConnectResult = {
  status: "CONNECTED";
  connectedAt: Date;
};

/**
 * Verifies against the real BizimHesap API before ever persisting
 * anything — a credential is stored only once connectivity is proven,
 * fail-closed otherwise. Encrypted at rest (see credential-crypto.ts);
 * NEXT never stores the raw token.
 */
export async function executeBizimHesapConnect(
  rawInput: BizimHesapConnectInput,
  fetchImpl?: FetchLike
): Promise<BizimHesapConnectResult> {
  const input = ConnectInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  try {
    await bizimHesapVerifyCredentials(
      { token: input.token, firmId: input.firmId },
      fetchImpl
    );
  } catch (error) {
    if (!(error instanceof BizimHesapRequestError)) {
      // Anything other than "the API rejected these credentials" (e.g.
      // MissingPartnerKeyError, a network-level throw) is a real-connection
      // prerequisite/config problem, not a bad merchant credential — do
      // not mask it, and do not persist anything.
      throw error;
    }

    await db.integrationConnection.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: "BIZIMHESAP"
        }
      },
      create: {
        organizationId: input.organizationId,
        provider: "BIZIMHESAP",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ token: input.token, firmId: input.firmId })
        ),
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

    throw new BizimHesapConnectionFailedError();
  }

  const connectedAt = new Date();

  await db.integrationConnection.upsert({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "BIZIMHESAP"
      }
    },
    create: {
      organizationId: input.organizationId,
      provider: "BIZIMHESAP",
      credentialsEncrypted: encryptSecret(
        JSON.stringify({ token: input.token, firmId: input.firmId })
      ),
      status: "CONNECTED"
    },
    update: {
      credentialsEncrypted: encryptSecret(
        JSON.stringify({ token: input.token, firmId: input.firmId })
      ),
      status: "CONNECTED",
      lastErrorAt: null,
      lastErrorCode: null
    }
  });

  return { status: "CONNECTED", connectedAt };
}
