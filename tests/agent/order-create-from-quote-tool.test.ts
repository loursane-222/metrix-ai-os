import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/order-create-from-quote-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native order_create_from_quote executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("keeps identity and idempotency in trusted server context, and refuses a non-WON quote", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createOrderCreateFromQuoteTool
    } = await import(
      "../../src/lib/agent/tools/order-create-from-quote-tool"
    );

    const {
      executeQuoteCreate
    } = await import(
      "../../src/lib/actions/quote-create"
    );

    const {
      executeQuoteMarkWon
    } = await import(
      "../../src/lib/actions/quote-mark-won"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `tool-ocfq-org-${suffix}`;
    const userId = `tool-ocfq-user-${suffix}`;
    const turnId = `tool-ocfq-turn-${suffix}`;
    const customerId = `tool-ocfq-customer-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Order Create Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Order Create Tool User"
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

      const tool = createOrderCreateFromQuoteTool();

      expect(tool.name).toBe(
        "order_create_from_quote"
      );

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

      // still DRAFT: must be refused, not silently accepted
      const draftAttempt = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const draftAttemptText =
        typeof draftAttempt === "string"
          ? draftAttempt
          : JSON.stringify(draftAttempt);

      expect(draftAttemptText).not.toContain(
        '"status":"VERIFIED"'
      );

      const noOrderYet = await db.order.count({
        where: { organizationId, sourceQuoteId: quoteId }
      });

      expect(noOrderYet).toBe(0);

      await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `won-${suffix}`,
        quoteId
      });

      const first = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const firstResult = (
        typeof first === "string"
          ? JSON.parse(first)
          : first
      ) as {
        action: "order.create_from_quote";
        status: "VERIFIED";
        verified: true;
        replayed: boolean;
        order: { id: string; sourceQuoteId: string };
      };

      expect(firstResult).toMatchObject({
        action: "order.create_from_quote",
        status: "VERIFIED",
        verified: true,
        replayed: false
      });

      expect(firstResult.order.sourceQuoteId).toBe(
        quoteId
      );

      const replay = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const replayResult = (
        typeof replay === "string"
          ? JSON.parse(replay)
          : replay
      ) as { replayed: boolean; order: { id: string } };

      expect(replayResult.replayed).toBe(true);
      expect(replayResult.order.id).toBe(
        firstResult.order.id
      );

      const orderCount = await db.order.count({
        where: { organizationId, sourceQuoteId: quoteId }
      });

      expect(orderCount).toBe(1);

      const executions =
        await db.actionExecution.findMany({
          where: {
            organizationId,
            actionType: "order.create_from_quote"
          }
        });

      expect(executions).toHaveLength(1);

      expect(
        executions[0]?.idempotencyKey
      ).toBe(
        `turn:${turnId}:order.create_from_quote:${quoteId}`
      );
    } finally {
      await db.orderItem.deleteMany({
        where: { organizationId }
      });

      await db.actionExecution.deleteMany({
        where: { organizationId }
      });

      await db.order.deleteMany({
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
