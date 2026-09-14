import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/quote-mark-won-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native quote_mark_won executive tool", () => {
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
      createQuoteMarkWonTool
    } = await import(
      "../../src/lib/agent/tools/quote-mark-won-tool"
    );

    const {
      executeQuoteCreate
    } = await import(
      "../../src/lib/actions/quote-create"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `tool-qmw-org-${suffix}`;
    const userId = `tool-qmw-user-${suffix}`;
    const turnId = `tool-qmw-turn-${suffix}`;
    const customerId = `tool-qmw-customer-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Mark Won Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Mark Won Tool User"
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
      const created = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-${suffix}`,
        customerId,
        title: "Danışmanlık teklifi"
      });

      const quoteId = created.quote.id;

      const tool = createQuoteMarkWonTool();

      expect(tool.name).toBe("quote_mark_won");

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("quoteId");
      expect(parameters).not.toContain("actorUserId");
      expect(parameters).not.toContain(
        "organizationId"
      );
      expect(parameters).not.toContain(
        "idempotencyKey"
      );

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const args = { quoteId };

      const first = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const firstResult = (
        typeof first === "string"
          ? JSON.parse(first)
          : first
      ) as {
        action: "quote.mark_won";
        status: "VERIFIED";
        verified: true;
        replayed: boolean;
        quote: { id: string; status: string };
      };

      expect(firstResult).toMatchObject({
        action: "quote.mark_won",
        status: "VERIFIED",
        verified: true,
        replayed: false
      });

      expect(firstResult.quote.id).toBe(quoteId);
      expect(firstResult.quote.status).toBe("WON");

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
            actionType: "quote.mark_won"
          }
        });

      expect(executions).toHaveLength(1);

      expect(
        executions[0]?.idempotencyKey
      ).toBe(`turn:${turnId}:quote.mark_won:${quoteId}`);

      const persisted = await db.quote.findUnique({
        where: { id: quoteId }
      });

      expect(persisted?.status).toBe("WON");
    } finally {
      await db.actionExecution.deleteMany({
        where: { organizationId }
      });

      await db.quoteItem.deleteMany({
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
