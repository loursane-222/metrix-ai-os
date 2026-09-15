import { describe, expect, it, afterAll } from "vitest";

import { db } from "../../src/lib/db";
import { lookupInventory } from "../../src/lib/data/inventory-lookup";
import { executePurchaseRecord } from "../../src/lib/actions/purchase-record";
import { executeInventoryTransfer } from "../../src/lib/actions/inventory-transfer";

describe("inventory lookup (read-only)", () => {
  it(
    "returns current balance and recent movement history derived from persisted evidence, tenant-safely",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const organizationId = `il-org-${suffix}`;
      const otherOrgId = `il-other-org-${suffix}`;
      const userId = `il-user-${suffix}`;
      const supplierId = `il-supplier-${suffix}`;

      await db.organization.createMany({
        data: [
          { id: organizationId, name: "Inventory Lookup Tenant" },
          { id: otherOrgId, name: "Other Tenant" }
        ]
      });
      await db.user.create({
        data: { id: userId, email: `${userId}@example.test`, name: "Lookup User" }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });
      await db.supplier.create({
        data: { id: supplierId, organizationId, name: "Tedarikçi" }
      });

      const fromLocation = await db.location.create({
        data: { organizationId, name: "Depo", kind: "WAREHOUSE" }
      });
      const toLocation = await db.location.create({
        data: { organizationId, name: "Şube", kind: "BRANCH" }
      });
      const product = await db.productService.create({
        data: { organizationId, name: "Süt", type: "PRODUCT" }
      });

      try {
        const empty = await lookupInventory({
          actorUserId: userId,
          organizationId,
          productServiceId: product.id
        });
        expect(empty.balances).toEqual([]);
        expect(empty.recentMovements).toEqual([]);

        await executePurchaseRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `purchase-${suffix}`,
          supplierId,
          locationId: fromLocation.id,
          items: [
            {
              productServiceId: product.id,
              unit: "litre",
              quantity: 50,
              unitCostCents: 200
            }
          ]
        });

        await executeInventoryTransfer({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `transfer-${suffix}`,
          productServiceId: product.id,
          fromLocationId: fromLocation.id,
          toLocationId: toLocation.id,
          quantity: 20
        });

        const byProduct = await lookupInventory({
          actorUserId: userId,
          organizationId,
          productServiceId: product.id
        });

        expect(byProduct.balances).toHaveLength(2);
        const fromBalance = byProduct.balances.find(
          (b) => b.locationId === fromLocation.id
        );
        const toBalance = byProduct.balances.find(
          (b) => b.locationId === toLocation.id
        );
        expect(fromBalance?.quantity).toBe(30);
        expect(toBalance?.quantity).toBe(20);

        expect(byProduct.recentMovements.length).toBeGreaterThanOrEqual(3);
        expect(
          byProduct.recentMovements.some((m) => m.kind === "PURCHASE_RECEIPT")
        ).toBe(true);
        expect(
          byProduct.recentMovements.some(
            (m) => m.kind === "TRANSFER" && m.direction === "OUT"
          )
        ).toBe(true);
        expect(
          byProduct.recentMovements.some(
            (m) => m.kind === "TRANSFER" && m.direction === "IN"
          )
        ).toBe(true);

        const byLocation = await lookupInventory({
          actorUserId: userId,
          organizationId,
          locationId: toLocation.id
        });
        expect(byLocation.balances).toHaveLength(1);
        expect(byLocation.balances[0]?.quantity).toBe(20);

        // tenant isolation: foreign org sees nothing for this product
        const foreignAttempt = await lookupInventory({
          actorUserId: userId,
          organizationId: otherOrgId,
          productServiceId: product.id
        }).catch((error) => error);

        expect(foreignAttempt).toMatchObject({
          code: "ORGANIZATION_ACCESS_DENIED"
        });
      } finally {
        await db.inventoryMovement.deleteMany({ where: { organizationId } });
        await db.inventoryTransfer.deleteMany({ where: { organizationId } });
        await db.inventoryBalance.deleteMany({ where: { organizationId } });
        await db.purchaseItem.deleteMany({ where: { organizationId } });
        await db.purchase.deleteMany({ where: { organizationId } });
        await db.actionExecution.deleteMany({ where: { organizationId } });
        await db.productService.deleteMany({ where: { organizationId } });
        await db.location.deleteMany({ where: { organizationId } });
        await db.supplier.deleteMany({ where: { organizationId } });
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
  await db.$disconnect();
});
