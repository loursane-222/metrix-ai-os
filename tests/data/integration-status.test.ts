import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { lookupIntegrationStatus } from "../../src/lib/data/integration-status";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("integration status (read-only)", () => {
  it("reports DISCONNECTED (not an error) when nothing was ever connected", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-none`;
    const organizationId = `int-status-org-${suffix}`;
    const userId = `int-status-user-${suffix}`;

    await db.organization.create({ data: { id: organizationId, name: "Tenant" } });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      const status = await lookupIntegrationStatus({
        actorUserId: userId,
        organizationId,
        provider: "NYLAS"
      });

      expect(status).toEqual({
        provider: "NYLAS",
        connected: false,
        status: "DISCONNECTED",
        email: null,
        lastErrorCode: null
      });
    } finally {
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
    }
  });

  it("reports the connected account's own email when CONNECTED", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-connected`;
    const organizationId = `int-status-connected-org-${suffix}`;
    const userId = `int-status-connected-user-${suffix}`;

    await db.organization.create({ data: { id: organizationId, name: "Tenant" } });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId: "grant-1", email: "sahibi@example.test", provider: "google" })
        )
      }
    });

    try {
      const status = await lookupIntegrationStatus({
        actorUserId: userId,
        organizationId,
        provider: "NYLAS"
      });

      expect(status).toEqual({
        provider: "NYLAS",
        connected: true,
        status: "CONNECTED",
        email: "sahibi@example.test",
        lastErrorCode: null
      });
    } finally {
      await db.integrationConnection.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
    }
  });
});

afterAll(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});
