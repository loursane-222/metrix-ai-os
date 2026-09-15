import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/tools/collection-record-tool.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("native collection_record executive tool", () => {
  it("requires the native tool implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it(
    "replays within the same turn, but records a genuine second collection on a new turn, with no trusted fields in its model-visible contract",
    async () => {
      expect(implementationExists).toBe(true);
      if (!implementationExists) return;

      const { RunContext } = await import("@openai/agents");
      const { db } = await import("../../src/lib/db");
      const {
        createCollectionRecordTool
      } = await import(
        "../../src/lib/agent/tools/collection-record-tool"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const organizationId = `tool-cr-org-${suffix}`;
      const userId = `tool-cr-user-${suffix}`;
      const customerId = `tool-cr-customer-${suffix}`;

      await db.organization.create({
        data: { id: organizationId, name: "Collection Tool Tenant" }
      });
      await db.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          name: "Collection Tool User"
        }
      });
      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });
      await db.customer.create({
        data: { id: customerId, organizationId, name: "Tahsilat A.Ş." }
      });

      try {
        const quote = await db.quote.create({
          data: {
            organizationId,
            customerId,
            customerName: "Tahsilat A.Ş.",
            title: "Tahsilat tool teklifi",
            status: "WON"
          }
        });

        const order = await db.order.create({
          data: {
            organizationId,
            customerId,
            sourceQuoteId: quote.id,
            orderNumber: "SIP-CR-0001",
            customerName: "Tahsilat A.Ş.",
            title: "Tahsilat tool siparişi",
            amount: 10_000
          }
        });

        const invoice = await db.invoice.create({
          data: {
            organizationId,
            customerId,
            sourceOrderId: order.id,
            invoiceNumber: "FTR-CR-0001",
            title: "Tahsilat tool faturası",
            amount: 10_000,
            taxAmount: 0,
            totalAmount: 10_000
          }
        });

        const tool = createCollectionRecordTool();

        expect(tool.name).toBe("collection_record");

        const parameters = JSON.stringify(tool.parameters);
        expect(parameters).toContain("invoiceId");
        expect(parameters).toContain("amount");
        expect(parameters).not.toContain("actorUserId");
        expect(parameters).not.toContain("organizationId");
        expect(parameters).not.toContain("idempotencyKey");

        const turnOneContext = new RunContext({
          actorUserId: userId,
          organizationId,
          turnId: `turn-one-${suffix}`
        });

        const first = await tool.invoke(
          turnOneContext,
          JSON.stringify({ invoiceId: invoice.id, amount: 3_000 })
        );

        const firstResult = (
          typeof first === "string" ? JSON.parse(first) : first
        ) as {
          status: string;
          replayed: boolean;
          collection: { settlementId: string; outstanding: number };
        };

        expect(firstResult.status).toBe("VERIFIED");
        expect(firstResult.replayed).toBe(false);
        expect(firstResult.collection.outstanding).toBe(7_000);

        // Same-turn replay: identical RunContext (same turnId) invoking
        // again with the same args must not create a duplicate.
        const replay = await tool.invoke(
          turnOneContext,
          JSON.stringify({ invoiceId: invoice.id, amount: 3_000 })
        );

        const replayResult = (
          typeof replay === "string" ? JSON.parse(replay) : replay
        ) as { replayed: boolean; collection: { settlementId: string } };

        expect(replayResult.replayed).toBe(true);
        expect(replayResult.collection.settlementId).toBe(
          firstResult.collection.settlementId
        );

        const settlementCountAfterReplay =
          await db.settlement.count({
            where: { organizationId }
          });
        expect(settlementCountAfterReplay).toBe(1);

        // A new turn (new turnId) recording a further collection is a
        // genuine, separate collection event.
        const turnTwoContext = new RunContext({
          actorUserId: userId,
          organizationId,
          turnId: `turn-two-${suffix}`
        });

        const second = await tool.invoke(
          turnTwoContext,
          JSON.stringify({ invoiceId: invoice.id, amount: 2_000 })
        );

        const secondResult = (
          typeof second === "string" ? JSON.parse(second) : second
        ) as {
          replayed: boolean;
          collection: { settlementId: string; outstanding: number };
        };

        expect(secondResult.replayed).toBe(false);
        expect(secondResult.collection.settlementId).not.toBe(
          firstResult.collection.settlementId
        );
        expect(secondResult.collection.outstanding).toBe(5_000);

        const settlementCountAfterSecond =
          await db.settlement.count({
            where: { organizationId }
          });
        expect(settlementCountAfterSecond).toBe(2);
      } finally {
        await db.application.deleteMany({ where: { organizationId } });
        await db.settlement.deleteMany({ where: { organizationId } });
        await db.payment.deleteMany({ where: { organizationId } });
        await db.actionExecution.deleteMany({
          where: { organizationId }
        });
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
    }
  );
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
