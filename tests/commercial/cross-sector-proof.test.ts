// Proves the SAME universal kernel — executePurchaseRecord,
// executeInventoryTransfer, executeTransformationRecord, lookupInventory —
// carries three unrelated business semantics with no per-domain module,
// branch, or special-casing anywhere in the kernel itself. Each `it` below
// is a fully independent tenant/scenario; the only thing shared across them
// is the imported kernel functions.
import { describe, expect, it, afterAll } from "vitest";

import { db } from "../../src/lib/db";
import { executePurchaseRecord } from "../../src/lib/actions/purchase-record";
import { executeInventoryTransfer } from "../../src/lib/actions/inventory-transfer";
import { executeTransformationRecord } from "../../src/lib/actions/transformation-record";
import { lookupInventory } from "../../src/lib/data/inventory-lookup";

async function seedTenant(suffix: string) {
  const organizationId = `xsec-org-${suffix}`;
  const userId = `xsec-user-${suffix}`;
  const supplierId = `xsec-supplier-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: `Cross-Sector Tenant ${suffix}` }
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "Tenant User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });
  await db.supplier.create({
    data: { id: supplierId, organizationId, name: "Tedarikçi" }
  });

  return { organizationId, userId, supplierId };
}

async function cleanupTenant(organizationId: string, userId: string) {
  await db.inventoryMovement.deleteMany({ where: { organizationId } });
  await db.transformationLine.deleteMany({ where: { organizationId } });
  await db.transformation.deleteMany({ where: { organizationId } });
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
  await db.organization.deleteMany({ where: { id: organizationId } });
}

describe("universal kernel cross-sector proof", () => {
  it(
    "RETAIL: purchase into a warehouse then transfer to a store, using only purchase_record + inventory_transfer",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-retail`;
      const { organizationId, userId, supplierId } = await seedTenant(suffix);

      try {
        const warehouse = await db.location.create({
          data: { organizationId, name: "Ana Depo", kind: "WAREHOUSE" }
        });
        const store = await db.location.create({
          data: { organizationId, name: "Mağaza", kind: "STORE" }
        });
        const tShirt = await db.productService.create({
          data: { organizationId, name: "Pamuklu Tişört", type: "PRODUCT" }
        });

        await executePurchaseRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `retail-purchase-${suffix}`,
          supplierId,
          locationId: warehouse.id,
          items: [
            {
              productServiceId: tShirt.id,
              unit: "adet",
              quantity: 100,
              unitCostCents: 4000
            }
          ]
        });

        await executeInventoryTransfer({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `retail-transfer-${suffix}`,
          productServiceId: tShirt.id,
          fromLocationId: warehouse.id,
          toLocationId: store.id,
          quantity: 30
        });

        const inventory = await lookupInventory({
          actorUserId: userId,
          organizationId,
          productServiceId: tShirt.id
        });

        const warehouseBalance = inventory.balances.find(
          (b) => b.locationId === warehouse.id
        );
        const storeBalance = inventory.balances.find(
          (b) => b.locationId === store.id
        );

        expect(warehouseBalance?.quantity).toBe(70);
        expect(storeBalance?.quantity).toBe(30);
      } finally {
        await cleanupTenant(organizationId, userId);
      }
    }
  );

  it(
    "CAFE: coffee + milk + cup consumed to produce one sellable latte portion, using only transformation_record",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-cafe`;
      const { organizationId, userId, supplierId } = await seedTenant(suffix);

      try {
        const counter = await db.location.create({
          data: { organizationId, name: "Kafe Tezgahı", kind: "PRODUCTION_AREA" }
        });

        const coffee = await db.productService.create({
          data: { organizationId, name: "Kahve Çekirdeği", type: "PRODUCT" }
        });
        const milk = await db.productService.create({
          data: { organizationId, name: "Süt", type: "PRODUCT" }
        });
        const cup = await db.productService.create({
          data: { organizationId, name: "Bardak", type: "PRODUCT" }
        });
        const latte = await db.productService.create({
          data: { organizationId, name: "Latte Porsiyonu", type: "PRODUCT" }
        });

        await executePurchaseRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `cafe-purchase-${suffix}`,
          supplierId,
          locationId: counter.id,
          items: [
            { productServiceId: coffee.id, unit: "kg", quantity: 1, unitCostCents: 80000 },
            { productServiceId: milk.id, unit: "litre", quantity: 5, unitCostCents: 3000 },
            { productServiceId: cup.id, unit: "adet", quantity: 50, unitCostCents: 500 }
          ]
        });

        const transformation = await executeTransformationRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `cafe-transform-${suffix}`,
          locationId: counter.id,
          title: "Latte hazırlama",
          lines: [
            { productServiceId: coffee.id, role: "INPUT", quantity: 0.02 },
            { productServiceId: milk.id, role: "INPUT", quantity: 0.2 },
            { productServiceId: cup.id, role: "INPUT", quantity: 1 },
            { productServiceId: latte.id, role: "OUTPUT", quantity: 1 }
          ]
        });

        expect(transformation.status).toBe("VERIFIED");

        const inventory = await lookupInventory({
          actorUserId: userId,
          organizationId,
          locationId: counter.id
        });

        const latteBalance = inventory.balances.find(
          (b) => b.productServiceId === latte.id
        );
        const coffeeBalance = inventory.balances.find(
          (b) => b.productServiceId === coffee.id
        );

        expect(latteBalance?.quantity).toBe(1);
        expect(coffeeBalance?.quantity).toBeCloseTo(0.98, 6);
      } finally {
        await cleanupTenant(organizationId, userId);
      }
    }
  );

  it(
    "MARBLE: slab input transforms into finished output + reusable remnant + scrap evidence, using only transformation_record",
    async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-marble`;
      const { organizationId, userId, supplierId } = await seedTenant(suffix);

      try {
        const workshop = await db.location.create({
          data: { organizationId, name: "Atölye", kind: "PRODUCTION_AREA" }
        });

        const slab = await db.productService.create({
          data: { organizationId, name: "Mermer Plaka", type: "PRODUCT" }
        });
        const countertop = await db.productService.create({
          data: { organizationId, name: "Mermer Tezgah", type: "PRODUCT" }
        });
        const remnant = await db.productService.create({
          data: { organizationId, name: "Kullanılabilir Artık", type: "PRODUCT" }
        });
        const scrap = await db.productService.create({
          data: { organizationId, name: "Fire", type: "PRODUCT" }
        });

        await executePurchaseRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `marble-purchase-${suffix}`,
          supplierId,
          locationId: workshop.id,
          items: [
            { productServiceId: slab.id, unit: "m2", quantity: 12, unitCostCents: 150000 }
          ]
        });

        await executeTransformationRecord({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `marble-transform-${suffix}`,
          locationId: workshop.id,
          title: "Mermer plaka kesimi",
          lines: [
            { productServiceId: slab.id, role: "INPUT", quantity: 12 },
            { productServiceId: countertop.id, role: "OUTPUT", quantity: 8 },
            { productServiceId: remnant.id, role: "REMNANT", quantity: 3 },
            { productServiceId: scrap.id, role: "SCRAP", quantity: 1 }
          ]
        });

        const inventory = await lookupInventory({
          actorUserId: userId,
          organizationId,
          locationId: workshop.id
        });

        expect(
          inventory.balances.find((b) => b.productServiceId === slab.id)
            ?.quantity
        ).toBe(0);
        expect(
          inventory.balances.find((b) => b.productServiceId === countertop.id)
            ?.quantity
        ).toBe(8);
        expect(
          inventory.balances.find((b) => b.productServiceId === remnant.id)
            ?.quantity
        ).toBe(3);
        expect(
          inventory.balances.find((b) => b.productServiceId === scrap.id)
        ).toBeUndefined();
      } finally {
        await cleanupTenant(organizationId, userId);
      }
    }
  );
});

afterAll(async () => {
  await db.$disconnect();
});
