import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/supplier-create.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified supplier.create action", () => {
  it("requires the typed supplier.create implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "authorizes, creates once idempotently, and returns only a verified readback, tenant-safely",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { executeSupplierCreate } = await import(
        "../../src/lib/actions/supplier-create"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const organizationId = `sup-org-${suffix}`;
      const otherOrgId = `sup-other-org-${suffix}`;
      const userId = `sup-user-${suffix}`;

      await db.organization.createMany({
        data: [
          { id: organizationId, name: "Supplier Tenant" },
          { id: otherOrgId, name: "Other Tenant" }
        ]
      });
      await db.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          name: "Supplier User"
        }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });

      try {
        const idempotencyKey = `create-${suffix}`;

        const first = await executeSupplierCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          name: "Anadolu Mermer Ltd."
        });

        expect(first.status).toBe("VERIFIED");
        expect(first.replayed).toBe(false);
        expect(first.supplier.name).toBe("Anadolu Mermer Ltd.");

        const replay = await executeSupplierCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          name: "Anadolu Mermer Ltd."
        });

        expect(replay.replayed).toBe(true);
        expect(replay.supplier.id).toBe(first.supplier.id);

        const count = await db.supplier.count({ where: { organizationId } });
        expect(count).toBe(1);

        await expect(
          executeSupplierCreate({
            actorUserId: userId,
            organizationId: otherOrgId,
            idempotencyKey: `foreign-${suffix}`,
            name: "Yabancı Tedarikçi"
          })
        ).rejects.toMatchObject({ code: "ORGANIZATION_ACCESS_DENIED" });
      } finally {
        await db.supplier.deleteMany({ where: { organizationId } });
        await db.actionExecution.deleteMany({ where: { organizationId } });
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.organization.deleteMany({
          where: { id: { in: [organizationId, otherOrgId] } }
        });
      }
    }
  );
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
