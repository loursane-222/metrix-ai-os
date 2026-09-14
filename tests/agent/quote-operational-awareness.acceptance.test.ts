import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import {
  Agent,
  Runner
} from "@openai/agents";

import {
  ScriptedModel,
  assistantMessage,
  functionCall
} from "@openai/agents/testing";

import {
  db
} from "../../src/lib/db";

import {
  createProductServiceLookupTool
} from "../../src/lib/agent/tools/product-service-lookup-tool";

import {
  createQuoteCreateTool
} from "../../src/lib/agent/tools/quote-create-tool";

import {
  createQuoteLookupTool
} from "../../src/lib/agent/tools/quote-lookup-tool";

import {
  createQuoteUpdateTool
} from "../../src/lib/agent/tools/quote-update-tool";

import type {
  MetrixExecutiveContext
} from "../../src/lib/agent/types";

const organizationIds: string[] = [];
const userIds: string[] = [];

function runnerFor(model: ScriptedModel) {
  const agent = new Agent<MetrixExecutiveContext>({
    name: "METRIX",
    instructions:
      "Use the native tools for the requested commercial intent. " +
      "Never guess a real id; resolve it via lookup first.",
    model,
    tools: [
      createProductServiceLookupTool(),
      createQuoteCreateTool(),
      createQuoteLookupTool(),
      createQuoteUpdateTool()
    ]
  });

  return {
    agent,
    runner: new Runner({ tracingDisabled: true })
  };
}

describe(
  "METRIX commercial kernel operational awareness acceptance",
  () => {
    it(
      "resolves the named product via lookup, then creates a quote whose total is server-computed",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const organizationId = `commercial-org-${suffix}`;
        const userId = `commercial-user-${suffix}`;
        const customerId = `commercial-customer-${suffix}`;
        const turnId = `commercial-turn-${suffix}`;

        organizationIds.push(organizationId);
        userIds.push(userId);

        await db.organization.create({
          data: { id: organizationId, name: "Commercial Tenant" }
        });

        await db.user.create({
          data: {
            id: userId,
            email: `${userId}@example.test`,
            name: "Commercial User"
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

        const product = await db.productService.create({
          data: {
            organizationId,
            name: "Danışmanlık Hizmeti",
            type: "SERVICE",
            priceCents: BigInt(10_000),
            status: "ACTIVE"
          }
        });

        const model = new ScriptedModel([
          [
            functionCall(
              "product_service_lookup",
              { query: "Danışmanlık" },
              { callId: "call_1" }
            )
          ],
          [
            functionCall(
              "quote_create",
              {
                customerId,
                title: "Danışmanlık teklifi",
                items: [
                  {
                    productServiceId: product.id,
                    name: "Danışmanlık Hizmeti",
                    quantity: 2,
                    unitPriceCents: 10_000
                  }
                ]
              },
              { callId: "call_2" }
            )
          ],
          [
            assistantMessage(
              "Danışmanlık teklifini oluşturdum ve doğruladım."
            )
          ]
        ]);

        const { agent, runner } = runnerFor(model);

        const result = await runner.run(
          agent,
          "Danışmanlık hizmeti için Zensoft'a teklif hazırla.",
          {
            context: { actorUserId: userId, organizationId, turnId }
          }
        );

        expect(result.finalOutput).toBe(
          "Danışmanlık teklifini oluşturdum ve doğruladım."
        );

        expect(model.calls).toHaveLength(3);

        const createTurnInput =
          model.calls[2]?.request.input;

        const createResult = (
          Array.isArray(createTurnInput)
            ? createTurnInput
            : []
        ).find(
          item =>
            item.type === "function_call_result" &&
            (item as { name?: string }).name ===
              "quote_create"
        ) as { output?: { text?: string } } | undefined;

        const verified = JSON.parse(
          createResult?.output?.text ?? "{}"
        ) as {
          status: string;
          verified: boolean;
          quote: {
            id: string;
            amount: number;
            items: Array<{
              productServiceId: string | null;
              lineTotalCents: string;
            }>;
          };
        };

        expect(verified.status).toBe("VERIFIED");
        expect(verified.verified).toBe(true);
        expect(
          verified.quote.items[0]?.productServiceId
        ).toBe(product.id);
        // 2 x 100.00 = 20000 cents, no discount/vat
        expect(
          verified.quote.items[0]?.lineTotalCents
        ).toBe("20000");
        expect(verified.quote.amount).toBe(200);

        const persisted = await db.quote.findUnique({
          where: { id: verified.quote.id },
          include: { items: true }
        });

        expect(Number(persisted?.amount)).toBe(200);
        expect(persisted?.items).toHaveLength(1);

        model.assertComplete();
      }
    );

    it(
      "finds the target quote via lookup, then updates it, only announcing success after VERIFIED",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-u`;

        const organizationId = `commercial-org-${suffix}`;
        const userId = `commercial-user-${suffix}`;
        const customerId = `commercial-customer-${suffix}`;
        const turnId = `commercial-turn-${suffix}`;

        organizationIds.push(organizationId);
        userIds.push(userId);

        await db.organization.create({
          data: { id: organizationId, name: "Commercial Tenant" }
        });

        await db.user.create({
          data: {
            id: userId,
            email: `${userId}@example.test`,
            name: "Commercial User"
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

        const quote = await db.quote.create({
          data: {
            organizationId,
            customerId,
            customerName: "Zensoft Teknoloji A.Ş.",
            title: "Danışmanlık teklifi"
          }
        });

        const model = new ScriptedModel([
          [
            functionCall(
              "quote_lookup",
              { query: "Danışmanlık" },
              { callId: "call_1" }
            )
          ],
          [
            functionCall(
              "quote_update",
              {
                quoteId: quote.id,
                specialTerms: "Peşin ödeme"
              },
              { callId: "call_2" }
            )
          ],
          [
            assistantMessage(
              "Danışmanlık teklifini güncelledim ve doğruladım."
            )
          ]
        ]);

        const { agent, runner } = runnerFor(model);

        const result = await runner.run(
          agent,
          "Danışmanlık teklifine peşin ödeme şartı ekle.",
          {
            context: { actorUserId: userId, organizationId, turnId }
          }
        );

        expect(result.finalOutput).toBe(
          "Danışmanlık teklifini güncelledim ve doğruladım."
        );

        const persisted = await db.quote.findUnique({
          where: { id: quote.id }
        });

        expect(persisted?.specialTerms).toBe(
          "Peşin ödeme"
        );

        model.assertComplete();
      }
    );
  }
);

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await db.quoteItem.deleteMany({ where: { organizationId } });
    await db.actionExecution.deleteMany({ where: { organizationId } });
    await db.quote.deleteMany({ where: { organizationId } });
    await db.productService.deleteMany({ where: { organizationId } });
    await db.customer.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }

  for (const userId of userIds) {
    await db.user.deleteMany({ where: { id: userId } });
  }

  await db.$disconnect();
});
