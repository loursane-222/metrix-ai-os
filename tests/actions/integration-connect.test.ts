import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { executeIntegrationConnect } from "../../src/lib/actions/integration-connect";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("integration.connect action", () => {
  it(
    "returns a deterministic connect action (one of NEXT's own routes) when nothing is connected yet — no Nylas credential required",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-none`;
      const organizationId = `int-connect-org-${suffix}`;
      const userId = `int-connect-user-${suffix}`;

      await db.organization.create({ data: { id: organizationId, name: "Tenant" } });
      await db.user.create({
        data: { id: userId, email: `${userId}@example.test`, name: "User" }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });

      try {
        const result = await executeIntegrationConnect({
          actorUserId: userId,
          organizationId,
          provider: "NYLAS"
        });

        expect(result).toEqual({
          provider: "NYLAS",
          alreadyConnected: false,
          title: "Google Hesabını Bağla",
          description:
            "Gmail ve Google Takvim'e erişim için Google'ın kendi izin ekranı açılacak. Yalnız izin verdiğin erişim alanları kullanılır.",
          connectUrl: "/api/integrations/nylas/connect"
        });
      } finally {
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      }
    }
  );

  it("returns alreadyConnected without a connectUrl when a grant is already connected", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-already`;
    const organizationId = `int-connect-already-org-${suffix}`;
    const userId = `int-connect-already-user-${suffix}`;

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
      const result = await executeIntegrationConnect({
        actorUserId: userId,
        organizationId,
        provider: "NYLAS"
      });

      expect(result).toEqual({
        provider: "NYLAS",
        alreadyConnected: true,
        email: "sahibi@example.test"
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
