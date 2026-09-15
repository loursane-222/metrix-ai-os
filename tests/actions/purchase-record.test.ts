import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/purchase-record.ts"
);

const implementationExists = existsSync(implementationPath);

async function createFixture(input: {
  db: typeof import("../../src/lib/db").db;
  suffix: string;
}) {
  const { db, suffix } = input;

  const organizationId = `pr-org-${suffix}`;
  const userId = `pr-user-${suffix}`;
  const supplierId = `pr-supplier-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Purchase Tenant" }
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "Purchase User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });
  await db.supplier.create({
    data: { id: supplierId, organizationId, name: "Anadolu Mermer Ltd." }
  });
  const location = await db.location.create({
    data: { organizationId, name: "Merkez Depo", kind: "WAREHOUSE" }
  });
  const product = await db.productService.create({
    data: { organizationId, name: "Mermer Plaka", type: "PRODUCT" }
  });

  return {
    organizationId,
    userId,
    supplierId,
    locationId: location.id,
    productServiceId: product.id
  };
}

async function cleanup(input: {
  db: typeof import("../../src/lib/db").db;
  organizationIds: string[];
  userIds: string[];
}) {
  const { db, organizationIds, userIds } = input;

  await db.inventoryMovement.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.inventoryBalance.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.purchaseItem.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.purchase.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.actionExecution.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.productService.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.location.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.supplier.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.organizationMember.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
}

describe("verified purchase.record action", () => {
  it("requires the typed purchase.record implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "materializes the resource's canonical unit, computes deterministic total cost, increases stock, and is idempotent within a turn while allowing a genuine second purchase",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { executePurchaseRecord } = await import(
        "../../src/lib/actions/purchase-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const fixture = await createFixture({ db, suffix });

      try {
        const idempotencyKey = `purchase-${suffix}`;

        const first = await executePurchaseRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey,
          supplierId: fixture.supplierId,
          locationId: fixture.locationId,
          items: [
            {
              productServiceId: fixture.productServiceId,
              unit: "m2",
              quantity: 10,
              unitCostCents: 50000
            }
          ]
        });

        expect(first.status).toBe("VERIFIED");
        expect(first.replayed).toBe(false);
        expect(first.purchase.totalCostCents).toBe("500000");
        expect(first.purchase.purchaseNumber).toMatch(/^SAT-\d{4}$/);

        const product = await db.productService.findUniqueOrThrow({
          where: { id: fixture.productServiceId }
        });
        expect(product.unitOfMeasure).toBe("M2");

        const balance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.locationId
            }
          }
        });
        expect(Number(balance.quantity)).toBe(10);

        // same-turn replay must not duplicate
        const replay = await executePurchaseRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey,
          supplierId: fixture.supplierId,
          locationId: fixture.locationId,
          items: [
            {
              productServiceId: fixture.productServiceId,
              unit: "m2",
              quantity: 10,
              unitCostCents: 50000
            }
          ]
        });
        expect(replay.replayed).toBe(true);
        expect(replay.purchase.id).toBe(first.purchase.id);

        const balanceAfterReplay = await db.inventoryBalance.findUniqueOrThrow(
          {
            where: {
              organizationId_productServiceId_locationId: {
                organizationId: fixture.organizationId,
                productServiceId: fixture.productServiceId,
                locationId: fixture.locationId
              }
            }
          }
        );
        expect(Number(balanceAfterReplay.quantity)).toBe(10);

        // cross-turn intentional second purchase
        const second = await executePurchaseRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey: `purchase-2-${suffix}`,
          supplierId: fixture.supplierId,
          locationId: fixture.locationId,
          items: [
            {
              productServiceId: fixture.productServiceId,
              unit: "m2",
              quantity: 5,
              unitCostCents: 50000
            }
          ]
        });
        expect(second.replayed).toBe(false);
        expect(second.purchase.id).not.toBe(first.purchase.id);

        const finalBalance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.locationId
            }
          }
        });
        expect(Number(finalBalance.quantity)).toBe(15);

        // unit mismatch fails closed
        await expect(
          executePurchaseRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `purchase-mismatch-${suffix}`,
            supplierId: fixture.supplierId,
            locationId: fixture.locationId,
            items: [
              {
                productServiceId: fixture.productServiceId,
                unit: "litre",
                quantity: 1,
                unitCostCents: 100
              }
            ]
          })
        ).rejects.toMatchObject({ code: "UNIT_OF_MEASURE_MISMATCH" });

        const balanceAfterMismatch = await db.inventoryBalance.findUniqueOrThrow(
          {
            where: {
              organizationId_productServiceId_locationId: {
                organizationId: fixture.organizationId,
                productServiceId: fixture.productServiceId,
                locationId: fixture.locationId
              }
            }
          }
        );
        expect(Number(balanceAfterMismatch.quantity)).toBe(15);
      } finally {
        await cleanup({
          db,
          organizationIds: [fixture.organizationId],
          userIds: [fixture.userId]
        });
      }
    }
  );

  it(
    "handles a genuine concurrent double-purchase of the same product/location without a lost update",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { executePurchaseRecord } = await import(
        "../../src/lib/actions/purchase-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-race`;
      const fixture = await createFixture({ db, suffix });

      try {
        const [a, b] = await Promise.all([
          executePurchaseRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `race-a-${suffix}`,
            supplierId: fixture.supplierId,
            locationId: fixture.locationId,
            items: [
              {
                productServiceId: fixture.productServiceId,
                unit: "kg",
                quantity: 5,
                unitCostCents: 1000
              }
            ]
          }),
          executePurchaseRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `race-b-${suffix}`,
            supplierId: fixture.supplierId,
            locationId: fixture.locationId,
            items: [
              {
                productServiceId: fixture.productServiceId,
                unit: "kg",
                quantity: 3,
                unitCostCents: 1000
              }
            ]
          })
        ]);

        expect(a.verified).toBe(true);
        expect(b.verified).toBe(true);
        expect(a.purchase.id).not.toBe(b.purchase.id);

        const balance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.locationId
            }
          }
        });

        expect(Number(balance.quantity)).toBe(8);

        const movementCount = await db.inventoryMovement.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(movementCount).toBe(2);
      } finally {
        await cleanup({
          db,
          organizationIds: [fixture.organizationId],
          userIds: [fixture.userId]
        });
      }
    }
  );

  it("enforces tenant isolation on supplier/location/product resolution", async () => {
    expect(implementationExists).toBe(true);
    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executePurchaseRecord,
      SupplierNotFoundError
    } = await import("../../src/lib/actions/purchase-record");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}-tenant`;
    const fixture = await createFixture({ db, suffix });

    const otherOrgId = `pr-other-org-${suffix}`;
    const otherUserId = `pr-other-user-${suffix}`;
    await db.organization.create({
      data: { id: otherOrgId, name: "Other Tenant" }
    });
    await db.user.create({
      data: {
        id: otherUserId,
        email: `${otherUserId}@example.test`,
        name: "Other User"
      }
    });
    await db.organizationMember.create({
      data: { organizationId: otherOrgId, userId: otherUserId, role: "MEMBER" }
    });

    try {
      await expect(
        executePurchaseRecord({
          actorUserId: otherUserId,
          organizationId: otherOrgId,
          idempotencyKey: `tenant-leak-${suffix}`,
          supplierId: fixture.supplierId,
          locationId: fixture.locationId,
          items: [
            {
              productServiceId: fixture.productServiceId,
              unit: "kg",
              quantity: 1,
              unitCostCents: 100
            }
          ]
        })
      ).rejects.toBeInstanceOf(SupplierNotFoundError);

      const leaked = await db.purchase.count({
        where: { organizationId: otherOrgId }
      });
      expect(leaked).toBe(0);
    } finally {
      await cleanup({
        db,
        organizationIds: [fixture.organizationId, otherOrgId],
        userIds: [fixture.userId, otherUserId]
      });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
