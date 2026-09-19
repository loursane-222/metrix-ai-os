import { afterAll, describe, expect, it } from "vitest";

import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";

import { createSalesSummaryTool } from "../../src/lib/agent/tools/sales-summary-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-sales-org-${suffix}`;
const userId = `tool-sales-user-${suffix}`;
const customerId = `tool-sales-customer-${suffix}`;

describe("sales_summary executive tool", () => {
  it("uses trusted context and returns grounded, deterministic period totals", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Tool Sales Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.customer.create({
      data: { id: customerId, organizationId, name: "Satış Müşterisi" }
    });

    const quote = await db.quote.create({
      data: {
        organizationId,
        customerId,
        customerName: "Satış Müşterisi",
        title: "Satış teklifi",
        status: "WON"
      }
    });

    const order = await db.order.create({
      data: {
        organizationId,
        customerId,
        sourceQuoteId: quote.id,
        orderNumber: `SIP-${suffix}`,
        customerName: "Satış Müşterisi",
        title: "Satış siparişi",
        amount: 1_000
      }
    });

    await db.invoice.create({
      data: {
        organizationId,
        customerId,
        sourceOrderId: order.id,
        invoiceNumber: `FTR-${suffix}`,
        title: "Satış faturası",
        amount: 1_000,
        taxAmount: 200,
        totalAmount: 1_200,
        createdAt: new Date("2026-09-10T12:00:00.000Z")
      }
    });

    const salesSummary = createSalesSummaryTool();

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `sales-turn-${suffix}`,
      referenceTimeIso: "2026-09-18T12:00:00.000Z"
    });

    const raw = await salesSummary.invoke(
      context,
      JSON.stringify({
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-09-30T23:59:59.999Z"
      })
    );

    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(serialized).toContain("1200");
    expect(serialized).toContain("TRY");
  });
});

afterAll(async () => {
  await db.invoice.deleteMany({ where: { organizationId } });
  await db.order.deleteMany({ where: { organizationId } });
  await db.quote.deleteMany({ where: { organizationId } });
  await db.customer.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });

  await db.$disconnect();
});
