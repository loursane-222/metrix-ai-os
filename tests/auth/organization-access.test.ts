import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/auth/organization-access.ts"
);

const implementationExists = existsSync(implementationPath);

describe("organization authorization boundary", () => {
  it("requires a server-side organization access implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("allows only users who belong to the requested organization", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      OrganizationAccessDeniedError,
      requireOrganizationAccess
    } = await import("../../src/lib/auth/organization-access");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const orgA = `auth-org-a-${suffix}`;
    const orgB = `auth-org-b-${suffix}`;
    const userA = `auth-user-a-${suffix}`;
    const userB = `auth-user-b-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: orgA, name: "Authorization Tenant A" },
        { id: orgB, name: "Authorization Tenant B" }
      ]
    });

    await db.user.createMany({
      data: [
        {
          id: userA,
          email: `${userA}@example.test`,
          name: "User A"
        },
        {
          id: userB,
          email: `${userB}@example.test`,
          name: "User B"
        }
      ]
    });

    await db.organizationMember.createMany({
      data: [
        {
          organizationId: orgA,
          userId: userA,
          role: "OWNER"
        },
        {
          organizationId: orgB,
          userId: userB,
          role: "MEMBER"
        }
      ]
    });

    try {
      const ownAccess =
        await requireOrganizationAccess({
          userId: userA,
          organizationId: orgA
        });

      expect(ownAccess.organizationId).toBe(orgA);
      expect(ownAccess.userId).toBe(userA);
      expect(ownAccess.role).toBe("OWNER");

      await expect(
        requireOrganizationAccess({
          userId: userA,
          organizationId: orgB
        })
      ).rejects.toBeInstanceOf(
        OrganizationAccessDeniedError
      );

      await expect(
        requireOrganizationAccess({
          userId: "unknown-user",
          organizationId: orgA
        })
      ).rejects.toBeInstanceOf(
        OrganizationAccessDeniedError
      );
    } finally {
      await db.organizationMember.deleteMany({
        where: {
          organizationId: {
            in: [orgA, orgB]
          }
        }
      });

      await db.user.deleteMany({
        where: {
          id: {
            in: [userA, userB]
          }
        }
      });

      await db.organization.deleteMany({
        where: {
          id: {
            in: [orgA, orgB]
          }
        }
      });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
