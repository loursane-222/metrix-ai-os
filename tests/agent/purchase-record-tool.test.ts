import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createPurchaseRecordTool } from "../../src/lib/agent/tools/purchase-record-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-pr-org-${suffix}`;
const userId = `tool-pr-user-${suffix}`;

describe("native purchase_record executive tool", () => {
  it("keeps identity/idempotency trusted, hides them from the model contract, and mutates deterministically", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Purchase Tool Org" }
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
      data: { organizationId, name: "Kahve Çekirdeği", type: "PRODUCT" }
    });

    const tool = createPurchaseRecordTool();
    expect(tool.name).toBe("purchase_record");
    const parameters = JSON.stringify(tool.parameters);
    expect(parameters).not.toContain("organizationId");
    expect(parameters).not.toContain("idempotencyKey");
    expect(parameters).not.toContain("actorUserId");

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `turn-${suffix}`
    });

    const raw = await tool.invoke(
      context,
      JSON.stringify({
        supplierId: supplier.id,
        locationId: location.id,
        items: [
          {
            productServiceId: product.id,
            unit: "kg",
            quantity: 5,
            unitCostCents: 1000
          }
        ]
      })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      status: string;
      purchase: { totalCostCents: string };
    };

    expect(result.status).toBe("VERIFIED");
    expect(result.purchase.totalCostCents).toBe("5000");

    const balance = await db.inventoryBalance.findUniqueOrThrow({
      where: {
        organizationId_productServiceId_locationId: {
          organizationId,
          productServiceId: product.id,
          locationId: location.id
        }
      }
    });
    expect(Number(balance.quantity)).toBe(5);
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
