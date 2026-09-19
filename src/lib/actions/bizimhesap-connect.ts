import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { encryptSecret } from "../integrations/credential-crypto";
import {
  BizimHesapRequestError,
  type FetchLike,
  bizimHesapFailureReason,
  bizimHesapVerifyCredentials
} from "../integrations/bizimhesap/bizimhesap-client";
import type { BizimHesapSyncResult } from "../integrations/bizimhesap/bizimhesap-sync";
import { executeBizimHesapSync } from "./bizimhesap-sync";

const ConnectInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  token: z.string().trim().min(1),
  firmId: z.string().trim().min(1).optional()
});

export type BizimHesapConnectInput = z.input<typeof ConnectInputSchema>;

export class BizimHesapConnectionFailedError extends Error {
  readonly code:
    | "BIZIMHESAP_CREDENTIALS_REJECTED"
    | "BIZIMHESAP_PROVIDER_UNAVAILABLE";
  readonly reason: "CREDENTIALS_REJECTED" | "PROVIDER_UNAVAILABLE";

  constructor(reason: "CREDENTIALS_REJECTED" | "PROVIDER_UNAVAILABLE") {
    super("Could not verify BizimHesap credentials");
    this.name = "BizimHesapConnectionFailedError";
    this.reason = reason;
    this.code = `BIZIMHESAP_${reason}`;
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
      // Anything other than a BizimHesap request failure (e.g. a missing
      // credential encryption key) is a deployment/config problem, not a
      // bad merchant credential — do not mask it, and do not persist
      // anything.
      throw error;
    }

    const reason = bizimHesapFailureReason(error);

    // An outage or network error says nothing about this credential, so
    // nothing is recorded against it. A rejection is recorded — but never
    // over a connection that is currently working (a wrong token typed
    // into a second attempt must not break the live one), and never with
    // the rejected token itself.
    if (reason === "CREDENTIALS_REJECTED") {
      const existing = await db.integrationConnection.findUnique({
        where: {
          organizationId_provider: {
            organizationId: input.organizationId,
            provider: "BIZIMHESAP"
          }
        },
        select: { status: true }
      });

      if (existing?.status !== "CONNECTED") {
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
      }
    }

    throw new BizimHesapConnectionFailedError(reason);
  }

  const connectedAt = new Date();
  const credentialsEncrypted = encryptSecret(
    JSON.stringify({ token: input.token, firmId: input.firmId })
  );

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
      credentialsEncrypted,
      status: "CONNECTED"
    },
    update: {
      credentialsEncrypted,
      status: "CONNECTED",
      lastErrorAt: null,
      lastErrorCode: null
    }
  });

  return { status: "CONNECTED", connectedAt };
}

export type BizimHesapFirstSync =
  | { status: "SYNCED"; result: BizimHesapSyncResult }
  | { status: "SYNC_FAILED" };

export type BizimHesapConnectWithFirstSyncResult = BizimHesapConnectResult & {
  firstSync: BizimHesapFirstSync;
};

/**
 * The one connect lifecycle: verify + persist the credential, then run the
 * first sync without the user asking for it. The two outcomes stay
 * separate — a connection that was proven but whose data preparation
 * failed is reported as CONNECTED + SYNC_FAILED, never as a failed
 * connection and never as a fully successful one.
 */
export async function executeBizimHesapConnectWithFirstSync(
  rawInput: BizimHesapConnectInput,
  fetchImpl?: FetchLike
): Promise<BizimHesapConnectWithFirstSyncResult> {
  const connected = await executeBizimHesapConnect(rawInput, fetchImpl);

  try {
    const result = await executeBizimHesapSync(
      {
        actorUserId: rawInput.actorUserId,
        organizationId: rawInput.organizationId
      },
      fetchImpl
    );

    return { ...connected, firstSync: { status: "SYNCED", result } };
  } catch {
    return { ...connected, firstSync: { status: "SYNC_FAILED" } };
  }
}
