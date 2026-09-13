import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const schemaPath = join(process.cwd(), "prisma/schema.prisma");
const storePath = join(
  process.cwd(),
  "src/lib/data/tenant-customer-store.ts"
);

const implementationExists =
  existsSync(schemaPath) &&
  existsSync(storePath);

describe("Phase 1 tenant-safe data layer", () => {
  it("defines the minimum company data model", () => {
    expect(existsSync(schemaPath)).toBe(true);

    if (!existsSync(schemaPath)) return;

    const schema = readFileSync(schemaPath, "utf8");

    for (const model of [
      "Organization",
      "User",
      "OrganizationMember",
      "Customer",
      "Task"
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
  });

  it("requires customer reads and writes to be organization scoped", async () => {
    expect(existsSync(storePath)).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      createCustomerForOrganization,
      listCustomersForOrganization
    } = await import("../../src/lib/data/tenant-customer-store");

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const orgA = `test-org-a-${suffix}`;
    const orgB = `test-org-b-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: orgA, name: "Tenant A" },
        { id: orgB, name: "Tenant B" }
      ]
    });

    try {
      await createCustomerForOrganization({
        organizationId: orgA,
        name: "Shared Customer Name"
      });

      await createCustomerForOrganization({
        organizationId: orgB,
        name: "Shared Customer Name"
      });

      const aCustomers =
        await listCustomersForOrganization(orgA);

      const bCustomers =
        await listCustomersForOrganization(orgB);

      expect(aCustomers).toHaveLength(1);
      expect(bCustomers).toHaveLength(1);

      expect(aCustomers[0]?.organizationId).toBe(orgA);
      expect(bCustomers[0]?.organizationId).toBe(orgB);

      expect(
        aCustomers.some(
          (customer) => customer.organizationId === orgB
        )
      ).toBe(false);

      expect(
        bCustomers.some(
          (customer) => customer.organizationId === orgA
        )
      ).toBe(false);
    } finally {
      await db.customer.deleteMany({
        where: {
          organizationId: {
            in: [orgA, orgB]
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
