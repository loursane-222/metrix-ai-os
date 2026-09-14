import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/invoice-lookup-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native invoice_lookup executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("uses trusted context and returns grounded invoice reality with items", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createInvoiceLookupTool
    } = await import(
      "../../src/lib/agent/tools/invoice-lookup-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `tool-il-org-${suffix}`;
    const userId = `tool-il-user-${suffix}`;
    const turnId = `tool-il-turn-${suffix}`;
    const customerId = `tool-il-customer-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Invoice Lookup Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Invoice Lookup Tool User"
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
      const quote = await db.quote.create({
        data: {
          organizationId,
          customerId,
          customerName: "Zensoft Teknoloji A.Ş.",
          title: "Yıllık bakım teklifi",
          status: "WON"
        }
      });

      const order = await db.order.create({
        data: {
          organizationId,
          customerId,
          sourceQuoteId: quote.id,
          orderNumber: "SIP-0001",
          customerName: "Zensoft Teknoloji A.Ş.",
          title: "Yıllık bakım teklifi",
          amount: 10
        }
      });

      const orderItem = await db.orderItem.create({
        data: {
          organizationId,
          orderId: order.id,
          name: "Bakım",
          quantity: 1,
          unitPriceCents: BigInt(1000),
          lineTotalCents: BigInt(1000),
          sortOrder: 0
        }
      });

      const invoice = await db.invoice.create({
        data: {
          organizationId,
          customerId,
          sourceOrderId: order.id,
          invoiceNumber: "FTR-2026-0001",
          title: "Yıllık bakım teklifi",
          amount: 10,
          taxAmount: 0,
          totalAmount: 10
        }
      });

      await db.invoiceItem.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          orderItemId: orderItem.id,
          name: "Bakım",
          quantity: 1,
          unitPriceCents: BigInt(1000),
          lineTotalCents: BigInt(1000),
          sortOrder: 0
        }
      });

      const tool = createInvoiceLookupTool();

      expect(tool.name).toBe("invoice_lookup");

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("invoiceId");
      expect(parameters).toContain("orderId");
      expect(parameters).toContain("status");
      expect(parameters).not.toContain("actorUserId");
      expect(parameters).not.toContain(
        "organizationId"
      );

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const raw = await tool.invoke(
        context,
        JSON.stringify({ query: "bakım" })
      );

      const result = (
        typeof raw === "string"
          ? JSON.parse(raw)
          : raw
      ) as {
        source: string;
        count: number;
        invoices: Array<{
          id: string;
          sourceOrderId: string;
          items: Array<{ name: string }>;
        }>;
      };

      expect(result.source).toBe("COMPANY_REALITY");
      expect(result.count).toBe(1);
      expect(result.invoices[0]?.id).toBe(invoice.id);
      expect(result.invoices[0]?.sourceOrderId).toBe(
        order.id
      );
      expect(result.invoices[0]?.items[0]?.name).toBe(
        "Bakım"
      );

      const byOrder = await tool.invoke(
        context,
        JSON.stringify({ orderId: order.id })
      );

      const byOrderResult = (
        typeof byOrder === "string"
          ? JSON.parse(byOrder)
          : byOrder
      ) as { count: number };

      expect(byOrderResult.count).toBe(1);

      const empty = await tool.invoke(
        context,
        JSON.stringify({
          query: "hiç eşleşmeyecek bir metin"
        })
      );

      const emptyResult = (
        typeof empty === "string"
          ? JSON.parse(empty)
          : empty
      ) as { count: number; invoices: unknown[] };

      expect(emptyResult.count).toBe(0);
      expect(emptyResult.invoices).toEqual([]);
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

      await db.order.deleteMany({
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
