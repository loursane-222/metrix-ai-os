import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import {
  NylasConnectionFailedError,
  executeNylasConnect
} from "../../src/lib/actions/nylas-connect";
import { MissingNylasCredentialsError } from "../../src/lib/integrations/nylas/nylas-client";
import { decryptSecret } from "../../src/lib/integrations/credential-crypto";
import type { FetchLike } from "../../src/lib/integrations/nylas/nylas-client";

const ORIGINAL_CLIENT_ID = process.env.NYLAS_CLIENT_ID;
const ORIGINAL_API_KEY = process.env.NYLAS_API_KEY;
const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

function okFetch(byPath: Record<string, unknown>): FetchLike {
  return async url => {
    const path = new URL(url).pathname;
    return { ok: true, status: 200, json: async () => byPath[path] ?? {} };
  };
}

function failingFetch(status: number): FetchLike {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

async function createOrgWithUser(suffix: string) {
  const organizationId = `nylas-connect-org-${suffix}`;
  const userId = `nylas-connect-user-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Nylas Connect Tenant" }
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });

  return { organizationId, userId };
}

describe("Nylas connect action", () => {
  it(
    "fails closed when NYLAS_CLIENT_ID/NYLAS_API_KEY are not configured (real-connection prerequisite missing)",
    async () => {
      delete process.env.NYLAS_CLIENT_ID;
      delete process.env.NYLAS_API_KEY;

      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-nokey`;
      const { organizationId, userId } = await createOrgWithUser(suffix);

      try {
        await expect(
          executeNylasConnect(
            {
              actorUserId: userId,
              organizationId,
              code: "auth-code",
              redirectUri: "https://app.test/api/integrations/nylas/callback"
            },
            okFetch({})
          )
        ).rejects.toBeInstanceOf(MissingNylasCredentialsError);
      } finally {
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      }
    }
  );

  it(
    "exchanges the code, persists only the encrypted grant, and fails closed + marks ERROR on a rejected code",
    async () => {
      process.env.NYLAS_CLIENT_ID = "test-client-id";
      process.env.NYLAS_API_KEY = "test-api-key";

      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-connect`;
      const { organizationId, userId } = await createOrgWithUser(suffix);
      const redirectUri = "https://app.test/api/integrations/nylas/callback";

      try {
        await expect(
          executeNylasConnect(
            { actorUserId: userId, organizationId, code: "bad-code", redirectUri },
            failingFetch(400)
          )
        ).rejects.toBeInstanceOf(NylasConnectionFailedError);

        const afterFailure = await db.integrationConnection.findUnique({
          where: { organizationId_provider: { organizationId, provider: "NYLAS" } }
        });
        expect(afterFailure?.status).toBe("ERROR");

        const result = await executeNylasConnect(
          { actorUserId: userId, organizationId, code: "good-code", redirectUri },
          okFetch({
            "/v3/connect/token": { access_token: "at", grant_id: "grant-1" },
            "/v3/grants/grant-1": {
              data: { id: "grant-1", email: "sahibi@example.test", provider: "google" }
            }
          })
        );

        expect(result).toEqual({
          status: "CONNECTED",
          email: "sahibi@example.test",
          provider: "google"
        });

        const connection = await db.integrationConnection.findUniqueOrThrow({
          where: { organizationId_provider: { organizationId, provider: "NYLAS" } }
        });
        expect(connection.status).toBe("CONNECTED");
        expect(connection.credentialsEncrypted).not.toContain("grant-1");

        const decrypted = JSON.parse(decryptSecret(connection.credentialsEncrypted));
        expect(decrypted).toEqual({
          grantId: "grant-1",
          email: "sahibi@example.test",
          provider: "google"
        });
      } finally {
        await db.integrationConnection.deleteMany({ where: { organizationId } });
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      }
    }
  );
});

afterAll(async () => {
  process.env.NYLAS_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.NYLAS_API_KEY = ORIGINAL_API_KEY;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});
