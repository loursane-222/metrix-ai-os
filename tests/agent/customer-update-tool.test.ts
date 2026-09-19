import { afterAll, describe, expect, it } from "vitest";

import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";

import { createCustomerUpdateTool } from "../../src/lib/agent/tools/customer-update-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-update-org-${suffix}`;
const userId = `tool-update-user-${suffix}`;

describe("customer_update executive tool", () => {
  it("updates only the given fields through the deterministic runtime", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Tool Update Org" }
    });

    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });

    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    const customer = await db.customer.create({
      data: {
        organizationId,
        name: "ABC Mermer",
        email: "abc@example.test"
      }
    });

    const customerUpdate = createCustomerUpdateTool();

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `update-turn-${suffix}`
    });

    const raw = await customerUpdate.invoke(
      context,
      JSON.stringify({
        customerId: customer.id,
        phone: "+90 555 333 33 33"
      })
    );

    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(serialized).toContain("VERIFIED");
    expect(serialized).toContain("+90 555 333 33 33");

    const persisted = await db.customer.findUnique({
      where: { id: customer.id }
    });

    expect(persisted?.phone).toBe("+90 555 333 33 33");
  });
});

afterAll(async () => {
  await db.customer.deleteMany({ where: { organizationId } });
  await db.actionExecution.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });

  await db.$disconnect();
});
