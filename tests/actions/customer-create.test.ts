import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/customer-create.ts"
);

const implementationExists = existsSync(
  implementationPath
);

describe("verified customer.create action", () => {
  it("requires the typed customer.create implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("authorizes, persists once, and returns only a verified readback", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const { executeCustomerCreate } = await import(
      "../../src/lib/actions/customer-create"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organizationId = `customer-org-${suffix}`;
    const userId = `customer-user-${suffix}`;
    const outsiderId = `customer-outsider-${suffix}`;
    const idempotencyKey = `customer-create-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Customer Action Tenant"
      }
    });

    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Authorized User"
        },
        {
          id: outsiderId,
          email: `${outsiderId}@example.test`,
          name: "Outsider User"
        }
      ]
    });

    await db.organizationMember.create({
      data: {
        organizationId,
        userId,
        role: "MEMBER"
      }
    });

    try {
      const first = await executeCustomerCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        name: "Belgin Tekstil",
        email: "belgin@example.test",
        phone: "+90 555 000 00 00",
        address: "Organize Sanayi Bölgesi No:12",
        taxNumber: "1234567890",
        taxOffice: "Kayseri Vergi Dairesi",
        contactName: "Belgin Yılmaz",
        contactPhone: "+90 555 111 11 11",
        notes: "Yıllık sözleşmeli müşteri",
        externalId: "belgin-001"
      });

      expect(first).toMatchObject({
        action: "customer.create",
        status: "VERIFIED",
        verified: true,
        replayed: false,
        customer: {
          organizationId,
          name: "Belgin Tekstil",
          email: "belgin@example.test",
          phone: "+90 555 000 00 00",
          address: "Organize Sanayi Bölgesi No:12",
          taxNumber: "1234567890",
          taxOffice: "Kayseri Vergi Dairesi",
          contactName: "Belgin Yılmaz",
          contactPhone: "+90 555 111 11 11",
          notes: "Yıllık sözleşmeli müşteri",
          externalId: "belgin-001"
        }
      });

      const persisted = await db.customer.findUnique({
        where: {
          id: first.customer.id
        }
      });

      expect(persisted).toMatchObject({
        organizationId,
        name: "Belgin Tekstil",
        email: "belgin@example.test",
        phone: "+90 555 000 00 00",
        address: "Organize Sanayi Bölgesi No:12",
        taxNumber: "1234567890",
        taxOffice: "Kayseri Vergi Dairesi",
        contactName: "Belgin Yılmaz",
        contactPhone: "+90 555 111 11 11",
        notes: "Yıllık sözleşmeli müşteri",
        externalId: "belgin-001"
      });

      const replay = await executeCustomerCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        name: "Belgin Tekstil",
        email: "belgin@example.test",
        phone: "+90 555 000 00 00",
        address: "Organize Sanayi Bölgesi No:12",
        taxNumber: "1234567890",
        taxOffice: "Kayseri Vergi Dairesi",
        contactName: "Belgin Yılmaz",
        contactPhone: "+90 555 111 11 11",
        notes: "Yıllık sözleşmeli müşteri",
        externalId: "belgin-001"
      });

      expect(replay.replayed).toBe(true);
      expect(replay.customer.id).toBe(first.customer.id);

      await expect(
        executeCustomerCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          name: "Aynı anahtarla başka müşteri"
        })
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT"
      });

      await expect(
        executeCustomerCreate({
          actorUserId: outsiderId,
          organizationId,
          idempotencyKey: `unauthorized-${suffix}`,
          name: "Yetkisiz müşteri"
        })
      ).rejects.toMatchObject({
        code: "ORGANIZATION_ACCESS_DENIED"
      });

      expect(
        await db.customer.count({
          where: {
            organizationId,
            name: "Yetkisiz müşteri"
          }
        })
      ).toBe(0);

      const execution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "customer.create",
            idempotencyKey
          }
        }
      });

      expect(execution).toMatchObject({
        status: "VERIFIED",
        resourceType: "Customer",
        resourceId: first.customer.id
      });
      expect(execution?.verifiedAt).not.toBeNull();
    } finally {
      await db.actionExecution.deleteMany({
        where: { organizationId }
      });
      await db.customer.deleteMany({
        where: { organizationId }
      });
      await db.organizationMember.deleteMany({
        where: { organizationId }
      });
      await db.user.deleteMany({
        where: {
          id: { in: [userId, outsiderId] }
        }
      });
      await db.organization.delete({
        where: { id: organizationId }
      });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
