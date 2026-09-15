import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/location-create.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified location.create action", () => {
  it("requires the typed location.create implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "authorizes, creates once idempotently, and returns only a verified readback, tenant-safely",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { executeLocationCreate } = await import(
        "../../src/lib/actions/location-create"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const organizationId = `loc-org-${suffix}`;
      const otherOrgId = `loc-other-org-${suffix}`;
      const userId = `loc-user-${suffix}`;

      await db.organization.createMany({
        data: [
          { id: organizationId, name: "Location Tenant" },
          { id: otherOrgId, name: "Other Tenant" }
        ]
      });
      await db.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          name: "Location User"
        }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });

      try {
        const idempotencyKey = `create-${suffix}`;

        const first = await executeLocationCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          name: "Merkez Depo",
          kind: "WAREHOUSE"
        });

        expect(first.status).toBe("VERIFIED");
        expect(first.replayed).toBe(false);
        expect(first.location.name).toBe("Merkez Depo");
        expect(first.location.kind).toBe("WAREHOUSE");

        const replay = await executeLocationCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          name: "Merkez Depo",
          kind: "WAREHOUSE"
        });

        expect(replay.replayed).toBe(true);
        expect(replay.location.id).toBe(first.location.id);

        const count = await db.location.count({ where: { organizationId } });
        expect(count).toBe(1);

        await expect(
          executeLocationCreate({
            actorUserId: userId,
            organizationId: otherOrgId,
            idempotencyKey: `foreign-${suffix}`,
            name: "Yabancı Depo",
            kind: "WAREHOUSE"
          })
        ).rejects.toMatchObject({ code: "ORGANIZATION_ACCESS_DENIED" });
      } finally {
        await db.location.deleteMany({ where: { organizationId } });
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
