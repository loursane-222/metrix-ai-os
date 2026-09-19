import { afterAll, describe, expect, it } from "vitest";

import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";

import { createReceivablesSummaryTool } from "../../src/lib/agent/tools/receivables-summary-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-receivables-org-${suffix}`;
const userId = `tool-receivables-user-${suffix}`;
const customerId = `tool-receivables-customer-${suffix}`;

describe("receivables_summary executive tool", () => {
  it("uses trusted context and returns grounded, deterministic totals", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Tool Receivables Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.customer.create({
      data: { id: customerId, organizationId, name: "Alacaklı Müşteri" }
    });

    const quote = await db.quote.create({
      data: {
        organizationId,
        customerId,
        customerName: "Alacaklı Müşteri",
        title: "Alacaklı teklifi",
        status: "WON"
      }
    });

    const order = await db.order.create({
      data: {
        organizationId,
        customerId,
        sourceQuoteId: quote.id,
        orderNumber: `SIP-${suffix}`,
        customerName: "Alacaklı Müşteri",
        title: "Alacaklı siparişi",
        amount: 5_000
      }
    });

    await db.invoice.create({
      data: {
        organizationId,
        customerId,
        sourceOrderId: order.id,
        invoiceNumber: `FTR-${suffix}`,
        title: "Alacaklı faturası",
        amount: 5_000,
        taxAmount: 0,
        totalAmount: 5_000
      }
    });

    const receivablesSummary = createReceivablesSummaryTool();

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `receivables-turn-${suffix}`,
      referenceTimeIso: "2026-09-18T12:00:00.000Z"
    });

    const raw = await receivablesSummary.invoke(context, JSON.stringify({}));

    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(serialized).toContain("Alacaklı Müşteri");
    expect(serialized).toContain("5000");
    expect(serialized).toContain("UNPAID");
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
