import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { executeIntegrationDisconnect } from "../../src/lib/actions/integration-disconnect";
import { loadNylasConnection } from "../../src/lib/integrations/nylas/nylas-connection";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("integration.disconnect action", () => {
  it("marks a connected grant DISCONNECTED, and loadNylasConnection stops finding it", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organizationId = `int-disconnect-org-${suffix}`;
    const userId = `int-disconnect-user-${suffix}`;

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
      expect(await loadNylasConnection(organizationId)).not.toBeNull();

      const result = await executeIntegrationDisconnect({
        actorUserId: userId,
        organizationId,
        provider: "NYLAS"
      });

      expect(result).toEqual({ provider: "NYLAS", disconnected: true });
      expect(await loadNylasConnection(organizationId)).toBeNull();
    } finally {
      await db.integrationConnection.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
    }
  });

  it("is a safe no-op (disconnected:false, no throw) when nothing was ever connected", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-noop`;
    const organizationId = `int-disconnect-noop-org-${suffix}`;
    const userId = `int-disconnect-noop-user-${suffix}`;

    await db.organization.create({ data: { id: organizationId, name: "Tenant" } });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      const result = await executeIntegrationDisconnect({
        actorUserId: userId,
        organizationId,
        provider: "NYLAS"
      });

      expect(result).toEqual({ provider: "NYLAS", disconnected: false });
    } finally {
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
