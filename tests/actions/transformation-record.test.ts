import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/transformation-record.ts"
);

const implementationExists = existsSync(implementationPath);

async function createFixture(input: {
  db: typeof import("../../src/lib/db").db;
  suffix: string;
  initialSlabQuantity: number;
}) {
  const { db, suffix, initialSlabQuantity } = input;

  const organizationId = `tr-org-${suffix}`;
  const userId = `tr-user-${suffix}`;
  const supplierId = `tr-supplier-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Transformation Tenant" }
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "Transformation User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });
  await db.supplier.create({
    data: { id: supplierId, organizationId, name: "Mermer Tedarikçisi" }
  });

  const location = await db.location.create({
    data: { organizationId, name: "Atölye", kind: "PRODUCTION_AREA" }
  });

  const slab = await db.productService.create({
    data: { organizationId, name: "Mermer Plaka", type: "PRODUCT" }
  });
  const countertop = await db.productService.create({
    data: { organizationId, name: "Mermer Tezgah", type: "PRODUCT" }
  });
  const remnant = await db.productService.create({
    data: { organizationId, name: "Kullanılabilir Mermer Artığı", type: "PRODUCT" }
  });
  const scrap = await db.productService.create({
    data: { organizationId, name: "Mermer Fire", type: "PRODUCT" }
  });

  const { executePurchaseRecord } = await import(
    "../../src/lib/actions/purchase-record"
  );

  await executePurchaseRecord({
    actorUserId: userId,
    organizationId,
    idempotencyKey: `seed-purchase-${suffix}`,
    supplierId,
    locationId: location.id,
    items: [
      {
        productServiceId: slab.id,
        unit: "m2",
        quantity: initialSlabQuantity,
        unitCostCents: 200000
      }
    ]
  });

  return {
    organizationId,
    userId,
    locationId: location.id,
    slabId: slab.id,
    countertopId: countertop.id,
    remnantId: remnant.id,
    scrapId: scrap.id
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
  await db.transformationLine.deleteMany({
    where: { organizationId: { in: organizationIds } }
  });
  await db.transformation.deleteMany({
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

describe("verified transformation.record action", () => {
  it("requires the typed transformation.record implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "consumes input, produces output and reusable remnant as real inventory, records scrap as evidence-only (no movement), atomically",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const { executeTransformationRecord } = await import(
        "../../src/lib/actions/transformation-record"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const fixture = await createFixture({
        db,
        suffix,
        initialSlabQuantity: 10
      });

      try {
        const idempotencyKey = `transform-${suffix}`;

        const first = await executeTransformationRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey,
          locationId: fixture.locationId,
          title: "Mermer plaka kesimi",
          lines: [
            { productServiceId: fixture.slabId, role: "INPUT", quantity: 10 },
            {
              productServiceId: fixture.countertopId,
              role: "OUTPUT",
              quantity: 6
            },
            {
              productServiceId: fixture.remnantId,
              role: "REMNANT",
              quantity: 2
            },
            { productServiceId: fixture.scrapId, role: "SCRAP", quantity: 2 }
          ]
        });

        expect(first.status).toBe("VERIFIED");
        expect(first.replayed).toBe(false);
        expect(first.transformation.lines).toHaveLength(4);

        const slabBalance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.slabId,
              locationId: fixture.locationId
            }
          }
        });
        expect(Number(slabBalance.quantity)).toBe(0);

        const countertopBalance = await db.inventoryBalance.findUniqueOrThrow(
          {
            where: {
              organizationId_productServiceId_locationId: {
                organizationId: fixture.organizationId,
                productServiceId: fixture.countertopId,
                locationId: fixture.locationId
              }
            }
          }
        );
        expect(Number(countertopBalance.quantity)).toBe(6);

        const remnantBalance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.remnantId,
              locationId: fixture.locationId
            }
          }
        });
        expect(Number(remnantBalance.quantity)).toBe(2);

        // SCRAP is evidence-only: no InventoryBalance row, no movement.
        const scrapBalance = await db.inventoryBalance.findUnique({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.scrapId,
              locationId: fixture.locationId
            }
          }
        });
        expect(scrapBalance).toBeNull();

        const scrapMovements = await db.inventoryMovement.count({
          where: {
            organizationId: fixture.organizationId,
            productServiceId: fixture.scrapId
          }
        });
        expect(scrapMovements).toBe(0);

        const scrapLine = await db.transformationLine.findFirst({
          where: {
            organizationId: fixture.organizationId,
            productServiceId: fixture.scrapId
          }
        });
        expect(scrapLine).not.toBeNull();
        expect(Number(scrapLine?.quantity)).toBe(2);

        // same-turn replay: no duplicate
        const replay = await executeTransformationRecord({
          actorUserId: fixture.userId,
          organizationId: fixture.organizationId,
          idempotencyKey,
          locationId: fixture.locationId,
          title: "Mermer plaka kesimi",
          lines: [
            { productServiceId: fixture.slabId, role: "INPUT", quantity: 10 },
            {
              productServiceId: fixture.countertopId,
              role: "OUTPUT",
              quantity: 6
            },
            {
              productServiceId: fixture.remnantId,
              role: "REMNANT",
              quantity: 2
            },
            { productServiceId: fixture.scrapId, role: "SCRAP", quantity: 2 }
          ]
        });
        expect(replay.replayed).toBe(true);

        const transformationCount = await db.transformation.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(transformationCount).toBe(1);
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
    "fails closed on insufficient input with no partial mutation",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeTransformationRecord,
        InsufficientInventoryError
      } = await import("../../src/lib/actions/transformation-record");

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-insufficient`;
      const fixture = await createFixture({
        db,
        suffix,
        initialSlabQuantity: 3
      });

      try {
        await expect(
          executeTransformationRecord({
            actorUserId: fixture.userId,
            organizationId: fixture.organizationId,
            idempotencyKey: `transform-fail-${suffix}`,
            locationId: fixture.locationId,
            title: "Yetersiz plaka kesimi",
            lines: [
              {
                productServiceId: fixture.slabId,
                role: "INPUT",
                quantity: 10
              },
              {
                productServiceId: fixture.countertopId,
                role: "OUTPUT",
                quantity: 6
              }
            ]
          })
        ).rejects.toBeInstanceOf(InsufficientInventoryError);

        const slabBalance = await db.inventoryBalance.findUniqueOrThrow({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.slabId,
              locationId: fixture.locationId
            }
          }
        });
        expect(Number(slabBalance.quantity)).toBe(3);

        const countertopBalance = await db.inventoryBalance.findUnique({
          where: {
            organizationId_productServiceId_locationId: {
              organizationId: fixture.organizationId,
              productServiceId: fixture.countertopId,
              locationId: fixture.locationId
            }
          }
        });
        expect(countertopBalance).toBeNull();

        const transformationCount = await db.transformation.count({
          where: { organizationId: fixture.organizationId }
        });
        expect(transformationCount).toBe(0);
      } finally {
        await cleanup({
          db,
          organizationIds: [fixture.organizationId],
          userIds: [fixture.userId]
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
