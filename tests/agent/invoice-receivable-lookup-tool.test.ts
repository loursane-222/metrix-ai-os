import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/invoice-receivable-lookup-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native invoice_receivable_lookup executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("uses trusted context and returns grounded receivable reality without trusted fields in its contract", async () => {
    expect(implementationExists).toBe(true);
    if (!implementationExists) return;

    const { RunContext } = await import("@openai/agents");
    const { db } = await import("../../src/lib/db");
    const {
      createInvoiceReceivableLookupTool
    } = await import(
      "../../src/lib/agent/tools/invoice-receivable-lookup-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `tool-irl-org-${suffix}`;
    const userId = `tool-irl-user-${suffix}`;
    const turnId = `tool-irl-turn-${suffix}`;
    const customerId = `tool-irl-customer-${suffix}`;

    await db.organization.create({
      data: { id: organizationId, name: "Receivable Tool Tenant" }
    });
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Receivable Tool User"
      }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.customer.create({
      data: { id: customerId, organizationId, name: "Alacak A.Ş." }
    });

    try {
      const quote = await db.quote.create({
        data: {
          organizationId,
          customerId,
          customerName: "Alacak A.Ş.",
          title: "Alacak tool teklifi",
          status: "WON"
        }
      });

      const order = await db.order.create({
        data: {
          organizationId,
          customerId,
          sourceQuoteId: quote.id,
          orderNumber: "SIP-IRL-0001",
          customerName: "Alacak A.Ş.",
          title: "Alacak tool siparişi",
          amount: 8_000
        }
      });

      const invoice = await db.invoice.create({
        data: {
          organizationId,
          customerId,
          sourceOrderId: order.id,
          invoiceNumber: "FTR-IRL-0001",
          title: "Alacak tool faturası",
          amount: 8_000,
          taxAmount: 0,
          totalAmount: 8_000
        }
      });

      const tool = createInvoiceReceivableLookupTool();

      expect(tool.name).toBe("invoice_receivable_lookup");

      const parameters = JSON.stringify(tool.parameters);
      expect(parameters).toContain("invoiceId");
      expect(parameters).not.toContain("actorUserId");
      expect(parameters).not.toContain("organizationId");

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const raw = await tool.invoke(
        context,
        JSON.stringify({ invoiceId: invoice.id })
      );

      const result = (
        typeof raw === "string" ? JSON.parse(raw) : raw
      ) as {
        source: string;
        receivable: {
          invoiceId: string;
          paymentId: string | null;
          receivableAmount: number;
          collected: number;
          outstanding: number;
          collectionState: string;
        };
      };

      expect(result.source).toBe("COMPANY_REALITY");
      expect(result.receivable.invoiceId).toBe(invoice.id);
      expect(result.receivable.paymentId).toBeNull();
      expect(result.receivable.receivableAmount).toBe(8_000);
      expect(result.receivable.collected).toBe(0);
      expect(result.receivable.outstanding).toBe(8_000);
      expect(result.receivable.collectionState).toBe("UNPAID");
    } finally {
      await db.invoice.deleteMany({ where: { organizationId } });
      await db.order.deleteMany({ where: { organizationId } });
      await db.quote.deleteMany({ where: { organizationId } });
      await db.customer.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({
        where: { organizationId }
      });
      await db.user.delete({ where: { id: userId } });
      await db.organization.delete({ where: { id: organizationId } });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
