import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/invoice-create-from-order-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native invoice_create_from_order executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("keeps identity and idempotency in trusted server context, and refuses an order with no items", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createInvoiceCreateFromOrderTool
    } = await import(
      "../../src/lib/agent/tools/invoice-create-from-order-tool"
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

    const {
      executeOrderCreateFromQuote
    } = await import(
      "../../src/lib/actions/order-create-from-quote"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `tool-icfo-org-${suffix}`;
    const userId = `tool-icfo-user-${suffix}`;
    const turnId = `tool-icfo-turn-${suffix}`;
    const customerId = `tool-icfo-customer-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Invoice Create Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Invoice Create Tool User"
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
      // --- an order with no items must be refused, not silently
      // accepted as a zero-amount invoice ---
      const emptyQuote = await db.quote.create({
        data: {
          organizationId,
          customerId,
          customerName: "Zensoft Teknoloji A.Ş.",
          title: "Kalemsiz teklif",
          status: "WON"
        }
      });

      const emptyOrder = await db.order.create({
        data: {
          organizationId,
          customerId,
          sourceQuoteId: emptyQuote.id,
          orderNumber: "SIP-TOOL-EMPTY",
          customerName: "Zensoft Teknoloji A.Ş.",
          title: "Kalemsiz sipariş",
          amount: null
        }
      });

      const tool = createInvoiceCreateFromOrderTool();

      expect(tool.name).toBe(
        "invoice_create_from_order"
      );

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("orderId");
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

      const emptyAttempt = await tool.invoke(
        context,
        JSON.stringify({ orderId: emptyOrder.id })
      );

      const emptyAttemptText =
        typeof emptyAttempt === "string"
          ? emptyAttempt
          : JSON.stringify(emptyAttempt);

      expect(emptyAttemptText).not.toContain(
        '"status":"VERIFIED"'
      );

      const noInvoiceYet = await db.invoice.count({
        where: {
          organizationId,
          sourceOrderId: emptyOrder.id
        }
      });

      expect(noInvoiceYet).toBe(0);

      // --- real WON quote -> DRAFT order -> invoice ---
      const created = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-quote-${suffix}`,
        customerId,
        title: "Danışmanlık teklifi",
        items: [
          {
            name: "Danışmanlık",
            quantity: 1,
            unitPriceCents: 5000
          }
        ]
      });

      await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `won-${suffix}`,
        quoteId: created.quote.id
      });

      const orderResult = await executeOrderCreateFromQuote({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `convert-${suffix}`,
        quoteId: created.quote.id
      });

      const args = { orderId: orderResult.order.id };

      const first = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const firstResult = (
        typeof first === "string"
          ? JSON.parse(first)
          : first
      ) as {
        action: "invoice.create_from_order";
        status: "VERIFIED";
        verified: true;
        replayed: boolean;
        invoice: { id: string; sourceOrderId: string };
      };

      expect(firstResult).toMatchObject({
        action: "invoice.create_from_order",
        status: "VERIFIED",
        verified: true,
        replayed: false
      });

      expect(firstResult.invoice.sourceOrderId).toBe(
        orderResult.order.id
      );

      const replay = await tool.invoke(
        context,
        JSON.stringify(args)
      );

      const replayResult = (
        typeof replay === "string"
          ? JSON.parse(replay)
          : replay
      ) as { replayed: boolean; invoice: { id: string } };

      expect(replayResult.replayed).toBe(true);
      expect(replayResult.invoice.id).toBe(
        firstResult.invoice.id
      );

      const invoiceCount = await db.invoice.count({
        where: {
          organizationId,
          sourceOrderId: orderResult.order.id
        }
      });

      expect(invoiceCount).toBe(1);

      const executions =
        await db.actionExecution.findMany({
          where: {
            organizationId,
            actionType: "invoice.create_from_order"
          }
        });

      expect(executions).toHaveLength(1);

      expect(
        executions[0]?.idempotencyKey
      ).toBe(
        `turn:${turnId}:invoice.create_from_order:${orderResult.order.id}`
      );
    } finally {
      await db.invoiceItem.deleteMany({
        where: { organizationId }
      });

      await db.invoice.deleteMany({
        where: { organizationId }
      });

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
