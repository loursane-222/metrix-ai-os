import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createInventoryTransferTool } from "../../src/lib/agent/tools/inventory-transfer-tool";
import { executePurchaseRecord } from "../../src/lib/actions/purchase-record";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-it-org-${suffix}`;
const userId = `tool-it-user-${suffix}`;

describe("native inventory_transfer executive tool", () => {
  it("keeps identity/idempotency trusted and moves stock atomically between two real locations", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Transfer Tool Org" }
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
    const fromLocation = await db.location.create({
      data: { organizationId, name: "Depo", kind: "WAREHOUSE" }
    });
    const toLocation = await db.location.create({
      data: { organizationId, name: "Şube", kind: "BRANCH" }
    });
    const product = await db.productService.create({
      data: { organizationId, name: "Ürün", type: "PRODUCT" }
    });

    await executePurchaseRecord({
      actorUserId: userId,
      organizationId,
      idempotencyKey: `seed-${suffix}`,
      supplierId: supplier.id,
      locationId: fromLocation.id,
      items: [
        { productServiceId: product.id, unit: "adet", quantity: 10, unitCostCents: 100 }
      ]
    });

    const tool = createInventoryTransferTool();
    expect(tool.name).toBe("inventory_transfer");
    const parameters = JSON.stringify(tool.parameters);
    expect(parameters).not.toContain("organizationId");
    expect(parameters).not.toContain("idempotencyKey");

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `turn-${suffix}`
    });

    const raw = await tool.invoke(
      context,
      JSON.stringify({
        productServiceId: product.id,
        fromLocationId: fromLocation.id,
        toLocationId: toLocation.id,
        quantity: 4
      })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      status: string;
      transfer: { fromLocationBalance: number; toLocationBalance: number };
    };

    expect(result.status).toBe("VERIFIED");
    expect(result.transfer.fromLocationBalance).toBe(6);
    expect(result.transfer.toLocationBalance).toBe(4);
  });
});

afterAll(async () => {
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
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
