import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createSupplierCreateTool } from "../../src/lib/agent/tools/supplier-create-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-sc-org-${suffix}`;
const userId = `tool-sc-user-${suffix}`;

describe("native supplier_create executive tool", () => {
  it("keeps identity and idempotency in trusted server context", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Supplier Create Tool Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    const tool = createSupplierCreateTool();
    expect(tool.name).toBe("supplier_create");
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
      JSON.stringify({ name: "Anadolu Mermer Ltd." })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      status: string;
      supplier: { name: string };
    };

    expect(result.status).toBe("VERIFIED");
    expect(result.supplier.name).toBe("Anadolu Mermer Ltd.");
  });
});

afterAll(async () => {
  await db.supplier.deleteMany({ where: { organizationId } });
  await db.actionExecution.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
