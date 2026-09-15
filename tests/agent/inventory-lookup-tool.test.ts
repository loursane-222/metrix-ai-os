import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createInventoryLookupTool } from "../../src/lib/agent/tools/inventory-lookup-tool";
import { executePurchaseRecord } from "../../src/lib/actions/purchase-record";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-il-org-${suffix}`;
const userId = `tool-il-user-${suffix}`;

describe("native inventory_lookup executive tool", () => {
  it("uses trusted context and returns grounded balance/movement reality without mutating", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Inventory Lookup Tool Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    const supplier = await db.supplier.create({
      data: { organizationId, name: "Tedarikçi" }
    });
    const location = await db.location.create({
      data: { organizationId, name: "Depo", kind: "WAREHOUSE" }
    });
    const product = await db.productService.create({
      data: { organizationId, name: "Ürün", type: "PRODUCT" }
    });

    await executePurchaseRecord({
      actorUserId: userId,
      organizationId,
      idempotencyKey: `seed-${suffix}`,
      supplierId: supplier.id,
      locationId: location.id,
      items: [
        { productServiceId: product.id, unit: "adet", quantity: 7, unitCostCents: 100 }
      ]
    });

    const tool = createInventoryLookupTool();
    expect(tool.name).toBe("inventory_lookup");

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `turn-${suffix}`
    });

    const raw = await tool.invoke(
      context,
      JSON.stringify({ productServiceId: product.id })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      source: string;
      inventory: {
        balances: Array<{ quantity: number }>;
        recentMovements: Array<{ kind: string }>;
      };
    };

    expect(result.source).toBe("COMPANY_REALITY");
    expect(result.inventory.balances[0]?.quantity).toBe(7);
    expect(
      result.inventory.recentMovements.some((m) => m.kind === "PURCHASE_RECEIPT")
    ).toBe(true);

    const purchaseCountBeforeAndAfter = await db.purchase.count({
      where: { organizationId }
    });
    expect(purchaseCountBeforeAndAfter).toBe(1);
  });
});

afterAll(async () => {
  await db.inventoryMovement.deleteMany({ where: { organizationId } });
  await db.inventoryBalance.deleteMany({ where: { organizationId } });
  await db.purchaseItem.deleteMany({ where: { organizationId } });
  await db.purchase.deleteMany({ where: { organizationId } });
  await db.actionExecution.deleteMany({ where: { organizationId } });
  await db.productService.deleteMany({ where: { organizationId } });
  await db.location.deleteMany({ where: { organizationId } });
  await db.supplier.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
