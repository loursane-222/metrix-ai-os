import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/collection-lookup-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native collection_lookup executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("uses trusted context and returns grounded collection ledger reality", async () => {
    expect(implementationExists).toBe(true);
    if (!implementationExists) return;

    const { RunContext } = await import("@openai/agents");
    const { db } = await import("../../src/lib/db");
    const {
      createCollectionLookupTool
    } = await import(
      "../../src/lib/agent/tools/collection-lookup-tool"
    );
    const {
      createCollectionRecordTool
    } = await import(
      "../../src/lib/agent/tools/collection-record-tool"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `tool-cl-org-${suffix}`;
    const userId = `tool-cl-user-${suffix}`;
    const turnId = `tool-cl-turn-${suffix}`;
    const customerId = `tool-cl-customer-${suffix}`;

    await db.organization.create({
      data: { id: organizationId, name: "Collection Lookup Tool Tenant" }
    });
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Collection Lookup Tool User"
      }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.customer.create({
      data: { id: customerId, organizationId, name: "Tahsilat Listesi A.Ş." }
    });

    try {
      const quote = await db.quote.create({
        data: {
          organizationId,
          customerId,
          customerName: "Tahsilat Listesi A.Ş.",
          title: "Tahsilat listesi tool teklifi",
          status: "WON"
        }
      });

      const order = await db.order.create({
        data: {
          organizationId,
          customerId,
          sourceQuoteId: quote.id,
          orderNumber: "SIP-CL-0001",
          customerName: "Tahsilat Listesi A.Ş.",
          title: "Tahsilat listesi tool siparişi",
          amount: 5_000
        }
      });

      const invoice = await db.invoice.create({
        data: {
          organizationId,
          customerId,
          sourceOrderId: order.id,
          invoiceNumber: "FTR-CL-0001",
          title: "Tahsilat listesi tool faturası",
          amount: 5_000,
          taxAmount: 0,
          totalAmount: 5_000
        }
      });

      const context = new RunContext({
        actorUserId: userId,
        organizationId,
        turnId
      });

      const recordTool = createCollectionRecordTool();
      await recordTool.invoke(
        context,
        JSON.stringify({ invoiceId: invoice.id, amount: 1_200 })
      );

      const lookupTool = createCollectionLookupTool();

      expect(lookupTool.name).toBe("collection_lookup");

      const parameters = JSON.stringify(lookupTool.parameters);
      expect(parameters).toContain("invoiceId");
      expect(parameters).not.toContain("actorUserId");
      expect(parameters).not.toContain("organizationId");

      const raw = await lookupTool.invoke(
        context,
        JSON.stringify({ invoiceId: invoice.id })
      );

      const result = (
        typeof raw === "string" ? JSON.parse(raw) : raw
      ) as {
        source: string;
        ledger: {
          totalCollected: number;
          outstanding: number;
          collections: Array<{ amount: number }>;
        };
      };

      expect(result.source).toBe("COMPANY_REALITY");
      expect(result.ledger.totalCollected).toBe(1_200);
      expect(result.ledger.outstanding).toBe(3_800);
      expect(result.ledger.collections).toHaveLength(1);
      expect(result.ledger.collections[0]?.amount).toBe(1_200);
    } finally {
      await db.application.deleteMany({ where: { organizationId } });
      await db.settlement.deleteMany({ where: { organizationId } });
      await db.payment.deleteMany({ where: { organizationId } });
      await db.actionExecution.deleteMany({ where: { organizationId } });
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
