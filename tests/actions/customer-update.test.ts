import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/customer-update.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified customer.update action", () => {
  it("requires the typed customer.update implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("authorizes, mutates only given fields, and returns only a verified readback", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const { executeCustomerCreate } = await import(
      "../../src/lib/actions/customer-create"
    );
    const { executeCustomerUpdate } = await import(
      "../../src/lib/actions/customer-update"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organizationId = `customer-update-org-${suffix}`;
    const userId = `customer-update-user-${suffix}`;
    const outsiderId = `customer-update-outsider-${suffix}`;

    await db.organization.create({
      data: { id: organizationId, name: "Customer Update Tenant" }
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
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      const created = await executeCustomerCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `customer-create-${suffix}`,
        name: "ABC Mermer",
        email: "abc@example.test"
      });

      const customerId = created.customer.id;
      const idempotencyKey = `customer-update-${suffix}`;

      const first = await executeCustomerUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        customerId,
        phone: "+90 555 222 22 22",
        taxNumber: "9998887776"
      });

      expect(first).toMatchObject({
        action: "customer.update",
        status: "VERIFIED",
        verified: true,
        replayed: false,
        customer: {
          id: customerId,
          name: "ABC Mermer",
          email: "abc@example.test",
          phone: "+90 555 222 22 22",
          taxNumber: "9998887776",
          address: null
        }
      });

      const persisted = await db.customer.findUnique({
        where: { id: customerId }
      });

      expect(persisted).toMatchObject({
        name: "ABC Mermer",
        phone: "+90 555 222 22 22",
        taxNumber: "9998887776"
      });

      const replay = await executeCustomerUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        customerId,
        phone: "+90 555 222 22 22",
        taxNumber: "9998887776"
      });

      expect(replay.replayed).toBe(true);

      await expect(
        executeCustomerUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          customerId,
          phone: "+90 555 999 99 99"
        })
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

      await expect(
        executeCustomerUpdate({
          actorUserId: outsiderId,
          organizationId,
          idempotencyKey: `unauthorized-${suffix}`,
          customerId,
          notes: "yetkisiz güncelleme"
        })
      ).rejects.toMatchObject({ code: "ORGANIZATION_ACCESS_DENIED" });

      await expect(
        executeCustomerUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `missing-customer-${suffix}`,
          customerId: `no-such-customer-${suffix}`,
          notes: "yok"
        })
      ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    } finally {
      await db.actionExecution.deleteMany({ where: { organizationId } });
      await db.customer.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({
        where: { id: { in: [userId, outsiderId] } }
      });
      await db.organization.delete({ where: { id: organizationId } });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
