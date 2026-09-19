import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import { decryptSecret } from "../integrations/credential-crypto";
import {
  type BizimHesapCredentials,
  type FetchLike
} from "../integrations/bizimhesap/bizimhesap-client";
import {
  type BizimHesapSyncResult,
  syncBizimHesapCatalog
} from "../integrations/bizimhesap/bizimhesap-sync";

const SyncInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1)
});

export type BizimHesapSyncInput = z.input<typeof SyncInputSchema>;

export class BizimHesapNotConnectedError extends Error {
  readonly code = "BIZIMHESAP_NOT_CONNECTED";

  constructor() {
    super("No connected BizimHesap integration for this organization");
    this.name = "BizimHesapNotConnectedError";
  }
}

export class BizimHesapSyncFailedError extends Error {
  readonly code = "BIZIMHESAP_SYNC_FAILED";

  constructor() {
    super("BizimHesap sync failed");
    this.name = "BizimHesapSyncFailedError";
  }
}

export async function executeBizimHesapSync(
  rawInput: BizimHesapSyncInput,
  fetchImpl?: FetchLike
): Promise<BizimHesapSyncResult> {
  const input = SyncInputSchema.parse(rawInput);

  await requireOrganizationAccess({
    userId: input.actorUserId,
    organizationId: input.organizationId
  });

  const connection = await db.integrationConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "BIZIMHESAP"
      }
    }
  });

  if (!connection || connection.status !== "CONNECTED") {
    throw new BizimHesapNotConnectedError();
  }

  const credentials = JSON.parse(
    decryptSecret(connection.credentialsEncrypted)
  ) as BizimHesapCredentials;

  try {
    const result = await syncBizimHesapCatalog({
      organizationId: input.organizationId,
      credentials,
      fetchImpl
    });

    await db.integrationConnection.update({
      where: { id: connection.id },
      data: {
        lastSuccessfulSyncAt: new Date(),
        status: "CONNECTED",
        lastErrorAt: null,
        lastErrorCode: null
      }
    });

    return result;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "UNKNOWN";

    // The credential was proven when it was connected; a failed data
    // preparation must not masquerade as a failed connection. The
    // connection stays CONNECTED (so the sync can simply be retried) and
    // only the error markers record what went wrong.
    await db.integrationConnection.update({
      where: { id: connection.id },
      data: {
        lastErrorAt: new Date(),
        lastErrorCode: code
      }
    });

    throw new BizimHesapSyncFailedError();
  }
}
