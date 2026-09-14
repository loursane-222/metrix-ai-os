import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/quote-create-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native quote_create executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("keeps identity and idempotency in trusted server context", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createQuoteCreateTool
    } = await import(
      "../../src/lib/agent/tools/quote-create-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId =
      `tool-qc-org-${suffix}`;

    const userId =
      `tool-qc-user-${suffix}`;

    const turnId =
      `tool-qc-turn-${suffix}`;

    const customerId =
      `tool-qc-customer-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Quote Create Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Quote Create Tool User"
      }
    });

    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    await db.customer.create({
      data: {
        id: customerId,
        organizationId,
        name: "Zensoft Teknoloji A.Ş."
      }
    });

    try {
      const tool = createQuoteCreateTool();

      expect(tool.name).toBe("quote_create");

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("customerId");
      expect(parameters).toContain("title");
      expect(parameters).toContain("items");

      expect(parameters).not.toContain(
        "actorUserId"
      );
      expect(parameters).not.toContain(
        "organizationId"
      );
      expect(parameters).not.toContain(
        "idempotencyKey"
      );
      expect(parameters).not.toContain(
        "createdByUserId"
      );

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const args = {
        customerId,
        title: "Danışmanlık teklifi",
        items: [
          {
            name: "Danışmanlık",
            quantity: 1,
            unitPriceCents: 10_000
          }
        ]
      };

      const first = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const firstResult = (
        typeof first === "string"
          ? JSON.parse(first)
          : first
      ) as {
        action: "quote.create";
        status: "VERIFIED";
        verified: true;
        replayed: boolean;
        quote: { id: string; customerId: string };
      };

      expect(firstResult).toMatchObject({
        action: "quote.create",
        status: "VERIFIED",
        verified: true,
        replayed: false
      });

      expect(firstResult.quote.customerId).toBe(
        customerId
      );

      const replay = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const replayResult = (
        typeof replay === "string"
          ? JSON.parse(replay)
          : replay
      ) as { replayed: boolean };

      expect(replayResult.replayed).toBe(true);

      const executions =
        await db.actionExecution.findMany({
          where: {
            organizationId,
            actionType: "quote.create"
          }
        });

      expect(executions).toHaveLength(1);

      expect(
        executions[0]?.idempotencyKey
      ).toBe(`turn:${turnId}:quote.create`);
    } finally {
      await db.quoteItem.deleteMany({
        where: { organizationId }
      });

      await db.actionExecution.deleteMany({
        where: { organizationId }
      });

      await db.quote.deleteMany({
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

  const { db } =
    await import("../../src/lib/db");

  await db.$disconnect();
});
