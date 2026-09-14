import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/order-lookup-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native order_lookup executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("uses trusted context and returns grounded order reality with items", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { RunContext } =
      await import("@openai/agents");

    const { db } =
      await import("../../src/lib/db");

    const {
      createOrderLookupTool
    } = await import(
      "../../src/lib/agent/tools/order-lookup-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `tool-ol-org-${suffix}`;
    const userId = `tool-ol-user-${suffix}`;
    const turnId = `tool-ol-turn-${suffix}`;
    const customerId = `tool-ol-customer-${suffix}`;

    await db.organization.create({
      data: {
        id: organizationId,
        name: "Native Order Lookup Tool Tenant"
      }
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Native Order Lookup Tool User"
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
          title: "Yıllık bakım teklifi"
        }
      });

      await db.orderItem.create({
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

      const tool = createOrderLookupTool();

      expect(tool.name).toBe("order_lookup");

      const parameters =
        JSON.stringify(tool.parameters);

      expect(parameters).toContain("orderId");
      expect(parameters).toContain("customerId");
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
        orders: Array<{
          id: string;
          sourceQuoteId: string;
          items: Array<{ name: string }>;
        }>;
      };

      expect(result.source).toBe("COMPANY_REALITY");
      expect(result.count).toBe(1);
      expect(result.orders[0]?.id).toBe(order.id);
      expect(result.orders[0]?.sourceQuoteId).toBe(
        quote.id
      );
      expect(result.orders[0]?.items[0]?.name).toBe(
        "Bakım"
      );

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
      ) as { count: number; orders: unknown[] };

      expect(emptyResult.count).toBe(0);
      expect(emptyResult.orders).toEqual([]);
    } finally {
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
