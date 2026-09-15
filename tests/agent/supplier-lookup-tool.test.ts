import { afterAll, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createSupplierLookupTool } from "../../src/lib/agent/tools/supplier-lookup-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-sl-org-${suffix}`;
const userId = `tool-sl-user-${suffix}`;

describe("native supplier_lookup executive tool", () => {
  it("uses trusted context and returns grounded supplier reality", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Supplier Lookup Tool Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.supplier.create({
      data: { organizationId, name: "Anadolu Mermer Ltd." }
    });

    const tool = createSupplierLookupTool();
    expect(tool.name).toBe("supplier_lookup");

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `turn-${suffix}`
    });

    const raw = await tool.invoke(
      context,
      JSON.stringify({ query: "mermer" })
    );

    const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
      source: string;
      count: number;
      suppliers: Array<{ name: string }>;
    };

    expect(result.source).toBe("COMPANY_REALITY");
    expect(result.count).toBe(1);
    expect(result.suppliers[0]?.name).toBe("Anadolu Mermer Ltd.");
  });
});

afterAll(async () => {
  await db.supplier.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
