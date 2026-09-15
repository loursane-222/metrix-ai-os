import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/inventory-transfer.ts"
);

const implementationExists = existsSync(implementationPath);

async function createFixture(input: {
  db: typeof import("../../src/lib/db").db;
  suffix: string;
  initialQuantity: number;
}) {
  const { db, suffix, initialQuantity } = input;

  const organizationId = `it-org-${suffix}`;
  const userId = `it-user-${suffix}`;
  const supplierId = `it-supplier-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Transfer Tenant" }
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "Transfer User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });
  await db.supplier.create({
    data: { id: supplierId, organizationId, name: "Tedarikçi" }
  });

  const fromLocation = await db.location.create({
    data: { organizationId, name: "Merkez Depo", kind: "WAREHOUSE" }
  });
  const toLocation = await db.location.create({
    data: { organizationId, name: "Kadıköy Şube", kind: "BRANCH" }
  });
  const product = await db.productService.create({
    data: {
      organizationId,
      name: "Kahve Çekirdeği",
      type: "PRODUCT",
      unitOfMeasure: "KG"
    }
  });

  const { executePurchaseRecord } = await import(
    "../../src/lib/actions/purchase-record"
  );

  await executePurchaseRecord({
    actorUserId: userId,
    organizationId,
    idempotencyKey: `seed-purchase-${suffix}`,
    supplierId,
    locationId: fromLocation.id,
    items: [
      {
        productServiceId: product.id,
        unit: "kg",
        quantity: initialQuantity,
        unitCostCents: 500
      }
    ]
  });

  return {
    organizationId,
    userId,
    fromLocationId: fromLocation.id,
    toLocationId: toLocation.id,
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
  await db.inventoryTransfer.deleteMany({
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

describe("verified inventory.transfer action", () => {
  it("requires the typed inventory.transfer implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "atomically moves stock between two locations, idempotently, and fails closed on insufficient stock with no partial mutation",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeInventoryTransfer,
        InsufficientInventoryError
      } = await import("../../src/lib/actions/inventory-transfer");

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const fixture = await createFixture({
        db,
        suffix,
        initialQuantity: 20
      });

      try {
        const idempotencyKey = `transfer-${suffix}`;

        const first = await executeInventoryTransfer({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey,
          productServiceId: fixture.productServiceId,
          fromLocationId: fixture.fromLocationId,
          toLocationId: fixture.toLocationId,
          quantity: 8
        });

        expect(first.status).toBe("VERIFIED");
        expect(first.transfer.fromLocationBalance).toBe(12);
        expect(first.transfer.toLocationBalance).toBe(8);

        const replay = await executeInventoryTransfer({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey,
          productServiceId: fixture.productServiceId,
          fromLocationId: fixture.fromLocationId,
          toLocationId: fixture.toLocationId,
          quantity: 8
        });
        expect(replay.replayed).toBe(true);

        const balanceAfterReplay = await db.inventoryBalance.findUniqueOrThrow(
          {
            where: {
              organizationId_productServiceId_locationId: {
                organizationId: fixture.organizationId,
                productServiceId: fixture.productServiceId,
                locationId: fixture.fromLocationId
              }
            }
          }
        );
        expect(Number(balanceAfterReplay.quantity)).toBe(12);

        // insufficient stock: fails closed, no partial mutation
        await expect(
          executeInventoryTransfer({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `over-${suffix}`,
            productServiceId: fixture.productServiceId,
            fromLocationId: fixture.fromLocationId,
            toLocationId: fixture.toLocationId,
            quantity: 999
          })
        ).rejects.toBeInstanceOf(InsufficientInventoryError);

        const fromAfterFailure = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.fromLocationId
            }
          }
        });
        const toAfterFailure = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.toLocationId
            }
          }
        });
        expect(Number(fromAfterFailure.quantity)).toBe(12);
        expect(Number(toAfterFailure.quantity)).toBe(8);

        const transferCount = await db.inventoryTransfer.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(transferCount).toBe(1);
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
    "handles a genuine concurrent over-transfer race: combined amount exceeds available, exactly one commits",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { executeInventoryTransfer } = await import(
        "../../src/lib/actions/inventory-transfer"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-race`;
      const fixture = await createFixture({
        db,
        suffix,
        initialQuantity: 10
      });

      try {
        const [settledA, settledB] = await Promise.allSettled([
          executeInventoryTransfer({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `race-a-${suffix}`,
            productServiceId: fixture.productServiceId,
            fromLocationId: fixture.fromLocationId,
            toLocationId: fixture.toLocationId,
            quantity: 7
          }),
          executeInventoryTransfer({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `race-b-${suffix}`,
            productServiceId: fixture.productServiceId,
            fromLocationId: fixture.fromLocationId,
            toLocationId: fixture.toLocationId,
            quantity: 7
          })
        ]);

        const fulfilled = [settledA, settledB].filter(
          (o) => o.status === "fulfilled"
        );
        const rejected = [settledA, settledB].filter(
          (o) => o.status === "rejected"
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const fromBalance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.fromLocationId
            }
          }
        });
        expect(Number(fromBalance.quantity)).toBe(3);
        expect(Number(fromBalance.quantity)).toBeGreaterThanOrEqual(0);
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
    "does not deadlock on two concurrent opposite-direction transfers between the same two locations",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { executeInventoryTransfer } = await import(
        "../../src/lib/actions/inventory-transfer"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-deadlock`;
      const fixture = await createFixture({
        db,
        suffix,
        initialQuantity: 10
      });

      // Seed some stock at the destination too, via a reverse transfer
      // first, so both directions have something to move.
      await executeInventoryTransfer({
        actorUserId: fixture.userId,
        organizationId: fixture.organizationId,
        idempotencyKey: `seed-reverse-${suffix}`,
        productServiceId: fixture.productServiceId,
        fromLocationId: fixture.fromLocationId,
        toLocationId: fixture.toLocationId,
        quantity: 4
      });

      try {
        const results = await Promise.all([
          executeInventoryTransfer({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `opposite-a-${suffix}`,
            productServiceId: fixture.productServiceId,
            fromLocationId: fixture.fromLocationId,
            toLocationId: fixture.toLocationId,
            quantity: 1
          }),
          executeInventoryTransfer({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `opposite-b-${suffix}`,
            productServiceId: fixture.productServiceId,
            fromLocationId: fixture.toLocationId,
            toLocationId: fixture.fromLocationId,
            quantity: 1
          })
        ]);

        expect(results.every((r) => r.verified)).toBe(true);

        const fromBalance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.fromLocationId
            }
          }
        });
        const toBalance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.productServiceId,
              locationId: fixture.toLocationId
            }
          }
        });

        // net effect of +1 and -1 cancels out relative to the post-seed
        // state (from=6, to=4)
        expect(Number(fromBalance.quantity)).toBe(6);
        expect(Number(toBalance.quantity)).toBe(4);
      } finally {
        await cleanup({
          db,
          organizationIds: [fixture.organizationId],
          userIds: [fixture.userId]
        });
      }
    },
    10_000
  );
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
