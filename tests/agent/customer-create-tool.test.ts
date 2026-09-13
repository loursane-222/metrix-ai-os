import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/customer-create-tool.ts"
);

const implementationExists = existsSync(implementationPath);

describe("native customer.create executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("exposes only user-owned customer fields and preserves the literal name", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } = await import("@openai/agents");
    const { db } = await import("../../src/lib/db");
    const { createCustomerCreateTool } = await import(
      "../../src/lib/agent/tools/customer-create-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organizationId = `customer-tool-org-${suffix}`;
    const userId = `customer-tool-user-${suffix}`;
    const turnId = `customer-tool-turn-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Customer Native Tool Tenant"
      }
    });
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Customer Native Tool User"
      }
    });
    await db.organizationMember.create({
      data: {
        organizationId,
        userId,
        role: "MEMBER"
      }
    });

    try {
      const tool = createCustomerCreateTool();

      expect(tool.name).toBe("customer_create");

      const parameters = JSON.stringify(tool.parameters);
      expect(parameters).toContain("name");
      expect(parameters).toContain("email");
      expect(parameters).not.toContain("externalId");
      expect(parameters).not.toContain("actorUserId");
      expect(parameters).not.toContain("organizationId");
      expect(parameters).not.toContain("idempotencyKey");
      expect(parameters).not.toContain("turnId");

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const customerName =
        "Belgin Tekstil E2E 67a9cad1-6660-4989-9215-ee365f2111d7";

      const first = await tool.invoke(
        context,
        JSON.stringify({
          name: customerName,
          email: null
        })
      );

      const firstResult = (
        typeof first === "string" ? JSON.parse(first) : first
      ) as {
        action: string;
        status: string;
        verified: boolean;
        replayed: boolean;
        customer: { id: string; organizationId: string };
      };

      expect(firstResult).toMatchObject({
        action: "customer.create",
        status: "VERIFIED",
        verified: true,
        replayed: false,
        customer: {
          organizationId,
          name: customerName,
          email: null,
          externalId: null
        }
      });

      const replay = await tool.invoke(
        context,
        JSON.stringify({
          name: customerName,
          email: null
        })
      );

      const replayResult = (
        typeof replay === "string" ? JSON.parse(replay) : replay
      ) as {
        replayed: boolean;
        customer: { id: string };
      };

      expect(replayResult.replayed).toBe(true);
      expect(replayResult.customer.id).toBe(firstResult.customer.id);
      expect(
        await db.customer.count({
          where: { organizationId, name: customerName }
        })
      ).toBe(1);

      const execution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "customer.create",
            idempotencyKey: `turn:${turnId}:customer.create`
          }
        }
      });

      expect(execution?.status).toBe("VERIFIED");
    } finally {
      await db.actionExecution.deleteMany({
        where: { organizationId }
      });
      await db.customer.deleteMany({
        where: { organizationId }
      });
      await db.organizationMember.deleteMany({
        where: { organizationId }
      });
      await db.user.delete({
        where: { id: userId }
      });
      await db.organization.delete({
        where: { id: organizationId }
      });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
