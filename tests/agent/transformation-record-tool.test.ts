import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createTransformationRecordTool } from "../../src/lib/agent/tools/transformation-record-tool";
import { executePurchaseRecord } from "../../src/lib/actions/purchase-record";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-tr-org-${suffix}`;
const userId = `tool-tr-user-${suffix}`;

describe("native transformation_record executive tool", () => {
  it("keeps identity/idempotency trusted and records an atomic input/output transformation", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Transformation Tool Org" }
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
      data: { organizationId, name: "Atölye", kind: "PRODUCTION_AREA" }
    });
    const slab = await db.productService.create({
      data: { organizationId, name: "Mermer Plaka", type: "PRODUCT" }
    });
    const countertop = await db.productService.create({
      data: { organizationId, name: "Tezgah", type: "PRODUCT" }
    });

    await executePurchaseRecord({
      actorUserId: userId,
      organizationId,
      idempotencyKey: `seed-${suffix}`,
      supplierId: supplier.id,
      locationId: location.id,
      items: [
        { productServiceId: slab.id, unit: "m2", quantity: 10, unitCostCents: 1000 }
      ]
    });

    const tool = createTransformationRecordTool();
    expect(tool.name).toBe("transformation_record");
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
        locationId: location.id,
        title: "Kesim",
        lines: [
          { productServiceId: slab.id, role: "INPUT", quantity: 10 },
          { productServiceId: countertop.id, role: "OUTPUT", quantity: 10 }
        ]
      })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      status: string;
      transformation: { updatedBalances: Array<{ quantity: number }> };
    };

    expect(result.status).toBe("VERIFIED");

    const countertopBalance = await db.inventoryBalance.findUniqueOrThrow({
      where: {
        organizationId_productServiceId_locationId: {
          organizationId,
          productServiceId: countertop.id,
          locationId: location.id
        }
      }
    });
    expect(Number(countertopBalance.quantity)).toBe(10);
  });
});

afterAll(async () => {
  await db.inventoryMovement.deleteMany({ where: { organizationId } });
  await db.transformationLine.deleteMany({ where: { organizationId } });
  await db.transformation.deleteMany({ where: { organizationId } });
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
