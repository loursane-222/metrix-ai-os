import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import {
  BizimHesapConnectionFailedError,
  executeBizimHesapConnect
} from "../../src/lib/actions/bizimhesap-connect";
import {
  BizimHesapNotConnectedError,
  executeBizimHesapSync
} from "../../src/lib/actions/bizimhesap-sync";
import { MissingPartnerKeyError } from "../../src/lib/integrations/bizimhesap/bizimhesap-client";
import { decryptSecret } from "../../src/lib/integrations/credential-crypto";
import type { FetchLike } from "../../src/lib/integrations/bizimhesap/bizimhesap-client";

const ORIGINAL_PARTNER_KEY = process.env.BIZIMHESAP_PARTNER_KEY;
const ORIGINAL_ENCRYPTION_KEY =
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY =
    randomBytes(32).toString("hex");
});

function okFetch(byPath: Record<string, unknown>): FetchLike {
  return async (url) => {
    const path = new URL(url).pathname.replace("/api/b2b", "");

    return { ok: true, status: 200, json: async () => byPath[path] ?? [] };
  };
}

function failingFetch(status: number): FetchLike {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

async function createOrgWithUser(suffix: string) {
  const organizationId = `bh-connect-org-${suffix}`;
  const userId = `bh-connect-user-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "BizimHesap Connect Tenant" }
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });

  return { organizationId, userId };
}

describe("BizimHesap connect + sync actions", () => {
  it(
    "fails closed with a clear error when BIZIMHESAP_PARTNER_KEY is not configured (real-connection prerequisite missing)",
    async () => {
      delete process.env.BIZIMHESAP_PARTNER_KEY;

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-nokey`;
      const { organizationId, userId } = await createOrgWithUser(suffix);

      try {
        await expect(
          executeBizimHesapConnect(
            { actorUserId: userId, organizationId, token: "whatever" },
            okFetch({})
          )
        ).rejects.toBeInstanceOf(MissingPartnerKeyError);
      } finally {
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      }
    }
  );

  it(
    "verifies credentials before storing them (encrypted), and fails closed + marks ERROR on an invalid credential",
    async () => {
      process.env.BIZIMHESAP_PARTNER_KEY = "test-partner-key";

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-connect`;
      const { organizationId, userId } = await createOrgWithUser(suffix);

      try {
        await expect(
          executeBizimHesapConnect(
            { actorUserId: userId, organizationId, token: "bad-token" },
            failingFetch(401)
          )
        ).rejects.toBeInstanceOf(BizimHesapConnectionFailedError);

        const afterFailure = await db.integrationConnection.findUnique({
          where: {
            organizationId_provider: { organizationId, provider: "BIZIMHESAP" }
          }
        });
        expect(afterFailure?.status).toBe("ERROR");

        await expect(
          executeBizimHesapSync({ actorUserId: userId, organizationId })
        ).rejects.toBeInstanceOf(BizimHesapNotConnectedError);

        const result = await executeBizimHesapConnect(
          { actorUserId: userId, organizationId, token: "good-token" },
          okFetch({ "/warehouses": [] })
        );
        expect(result.status).toBe("CONNECTED");

        const connection = await db.integrationConnection.findUniqueOrThrow({
          where: {
            organizationId_provider: { organizationId, provider: "BIZIMHESAP" }
          }
        });
        expect(connection.status).toBe("CONNECTED");
        expect(connection.credentialsEncrypted).not.toContain(
          "good-token"
        );

        const decrypted = JSON.parse(
          decryptSecret(connection.credentialsEncrypted)
        );
        expect(decrypted.token).toBe("good-token");

        const syncResult = await executeBizimHesapSync(
          { actorUserId: userId, organizationId },
          okFetch({
            "/warehouses": [{ id: "w1", name: "Depo" }],
            "/products": []
          })
        );
        expect(syncResult.locationsCreated).toBe(1);

        const connectionAfterSync =
          await db.integrationConnection.findUniqueOrThrow({
            where: {
              organizationId_provider: {
                organizationId,
                provider: "BIZIMHESAP"
              }
            }
          });
        expect(connectionAfterSync.lastSuccessfulSyncAt).not.toBeNull();
      } finally {
        await db.externalSourceBinding.deleteMany({
          where: { organizationId }
        });
        await db.location.deleteMany({ where: { organizationId } });
        await db.integrationConnection.deleteMany({
          where: { organizationId }
        });
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      }
    }
  );
});

afterAll(async () => {
  process.env.BIZIMHESAP_PARTNER_KEY = ORIGINAL_PARTNER_KEY;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});
