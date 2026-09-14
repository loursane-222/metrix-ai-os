import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/order-create-from-quote.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified order.create_from_quote action", () => {
  it("requires the typed order.create_from_quote implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("converts exactly one WON quote into exactly one DRAFT order with a full commercial/item snapshot, idempotently and tenant-safely", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executeOrderCreateFromQuote
    } = await import(
      "../../src/lib/actions/order-create-from-quote"
    );
    const {
      executeQuoteCreate
    } = await import("../../src/lib/actions/quote-create");
    const {
      executeQuoteMarkWon
    } = await import("../../src/lib/actions/quote-mark-won");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `ocfq-org-${suffix}`;
    const otherOrgId = `ocfq-other-org-${suffix}`;
    const userId = `ocfq-user-${suffix}`;
    const otherOrgUserId = `ocfq-other-user-${suffix}`;
    const customerId = `ocfq-customer-${suffix}`;
    const productId = `ocfq-product-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Order Create Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Order Create User"
        },
        {
          id: otherOrgUserId,
          email: `${otherOrgUserId}@example.test`,
          name: "Other Org User"
        }
      ]
    });

    await db.organizationMember.createMany({
      data: [
        { organizationId, userId, role: "MEMBER" },
        {
          organizationId: otherOrgId,
          userId: otherOrgUserId,
          role: "MEMBER"
        }
      ]
    });

    await db.customer.create({
      data: {
        id: customerId,
        organizationId,
        name: "Zensoft Teknoloji A.Ş."
      }
    });

    await db.productService.create({
      data: {
        id: productId,
        organizationId,
        name: "Danışmanlık",
        type: "SERVICE",
        status: "ACTIVE"
      }
    });

    try {
      // --- DRAFT quote must be rejected ---
      const draftQuote = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `draft-quote-${suffix}`,
        customerId,
        title: "Henüz kabul edilmemiş teklif"
      });

      await expect(
        executeOrderCreateFromQuote({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `draft-attempt-${suffix}`,
          quoteId: draftQuote.quote.id
        })
      ).rejects.toMatchObject({ code: "QUOTE_NOT_WON" });

      const noOrderForDraft = await db.order.count({
        where: { sourceQuoteId: draftQuote.quote.id }
      });

      expect(noOrderForDraft).toBe(0);

      // --- real WON quote with items to convert ---
      const created = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-${suffix}`,
        customerId,
        title: "Yıllık bakım teklifi",
        specialTerms: "Peşin ödeme",
        deliveryTerm: "EXW",
        deliveryMethod: "Kargo",
        generalDiscountBasisPoints: 1000,
        items: [
          {
            productServiceId: productId,
            name: "Danışmanlık",
            unit: "saat",
            quantity: 2,
            unitPriceCents: 1000,
            discountBasisPoints: 1000,
            vatRateBasisPoints: 2000
          },
          {
            name: "Ek kalem",
            quantity: 3,
            unitPriceCents: 500
          }
        ]
      });

      const quoteId = created.quote.id;

      await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `won-${suffix}`,
        quoteId
      });

      const wonQuote = await db.quote.findUniqueOrThrow(
        { where: { id: quoteId } }
      );
      expect(wonQuote.status).toBe("WON");

      const idempotencyKey = `convert-${suffix}`;

      const first = await executeOrderCreateFromQuote({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        quoteId
      });

      expect(first.action).toBe(
        "order.create_from_quote"
      );
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.order.sourceQuoteId).toBe(quoteId);
      expect(first.order.status).toBe("DRAFT");
      expect(first.order.customerId).toBe(customerId);
      expect(first.order.customerName).toBe(
        "Zensoft Teknoloji A.Ş."
      );
      expect(first.order.title).toBe(
        "Yıllık bakım teklifi"
      );
      expect(first.order.currency).toBe("TRY");
      // amount is the Quote's OWN persisted (server-computed) amount,
      // never recomputed or fabricated here
      expect(first.order.amount).toBe(
        created.quote.amount
      );
      expect(first.order.items).toHaveLength(2);

      // full item-level snapshot fidelity, including productService link
      expect(first.order.items[0]).toMatchObject({
        productServiceId: productId,
        name: "Danışmanlık",
        unit: "saat",
        quantity: 2,
        unitPriceCents: "1000",
        discountBasisPoints: 1000,
        vatRateBasisPoints: 2000,
        lineTotalCents:
          created.quote.items[0]?.lineTotalCents
      });

      expect(first.order.items[1]).toMatchObject({
        productServiceId: null,
        name: "Ek kalem",
        quantity: 3,
        unitPriceCents: "500",
        lineTotalCents:
          created.quote.items[1]?.lineTotalCents
      });

      const persistedOrder = await db.order.findUnique(
        {
          where: { id: first.order.id },
          include: { items: true }
        }
      );

      expect(persistedOrder?.organizationId).toBe(
        organizationId
      );
      expect(
        persistedOrder?.orderNumber
      ).toMatch(/^SIP-\d{4}$/);
      expect(
        persistedOrder?.generalDiscountBasisPoints
      ).toBe(1000);
      expect(persistedOrder?.deliveryTerm).toBe("EXW");
      expect(persistedOrder?.deliveryMethod).toBe(
        "Kargo"
      );
      expect(persistedOrder?.items).toHaveLength(2);

      const onlyOneOrder = await db.order.count({
        where: { organizationId, sourceQuoteId: quoteId }
      });
      expect(onlyOneOrder).toBe(1);

      // --- exact replay: same idempotencyKey ---
      const replay = await executeOrderCreateFromQuote({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        quoteId
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.order.id).toBe(first.order.id);

      const stillOneOrderAfterReplay = await db.order.count(
        {
          where: {
            organizationId,
            sourceQuoteId: quoteId
          }
        }
      );
      expect(stillOneOrderAfterReplay).toBe(1);

      // --- cross-turn duplicate: SAME quoteId, DIFFERENT idempotencyKey
      // (simulates a different conversation turn re-requesting the
      // same conversion) — must resolve to the SAME order, never a
      // second one.
      const crossTurn = await executeOrderCreateFromQuote({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `cross-turn-${suffix}`,
        quoteId
      });

      expect(crossTurn.verified).toBe(true);
      expect(crossTurn.replayed).toBe(true);
      expect(crossTurn.order.id).toBe(first.order.id);

      const stillOneOrderAfterCrossTurn =
        await db.order.count({
          where: {
            organizationId,
            sourceQuoteId: quoteId
          }
        });
      expect(stillOneOrderAfterCrossTurn).toBe(1);

      const bothExecutionsVerified =
        await db.actionExecution.findMany({
          where: {
            organizationId,
            actionType: "order.create_from_quote",
            resourceId: first.order.id
          }
        });

      // one row for the original idempotencyKey, one for the
      // cross-turn key — the exact-replay call reused the first row,
      // it did not create a third.
      expect(bothExecutionsVerified).toHaveLength(2);
      expect(
        bothExecutionsVerified.every(
          e => e.status === "VERIFIED"
        )
      ).toBe(true);

      // --- foreign org cannot see/convert the quote ---
      await expect(
        executeOrderCreateFromQuote({
          actorUserId: otherOrgUserId,
          organizationId: otherOrgId,
          idempotencyKey: `cross-tenant-${suffix}`,
          quoteId
        })
      ).rejects.toMatchObject({ code: "QUOTE_NOT_FOUND" });

      const noCrossTenantLeak = await db.order.count({
        where: { organizationId: otherOrgId }
      });
      expect(noCrossTenantLeak).toBe(0);

      const execution = await db.actionExecution.findUnique(
        {
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId,
              actionType: "order.create_from_quote",
              idempotencyKey
            }
          }
        }
      );

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.verifiedAt).not.toBeNull();
    } finally {
      await db.orderItem.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.actionExecution.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.order.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.quoteItem.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.quote.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.productService.deleteMany({
        where: { organizationId }
      });

      await db.customer.deleteMany({
        where: { organizationId }
      });

      await db.organizationMember.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.user.deleteMany({
        where: {
          id: { in: [userId, otherOrgUserId] }
        }
      });

      await db.organization.deleteMany({
        where: {
          id: { in: [organizationId, otherOrgId] }
        }
      });
    }
  });

  it(
    "handles a genuine P2002 race on sourceQuoteId safely by resolving to the winning order",
    async () => {
      expect(implementationExists).toBe(true);

      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeOrderCreateFromQuote
      } = await import(
        "../../src/lib/actions/order-create-from-quote"
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
        `${Date.now()}-${Math.random().toString(36).slice(2)}-race`;

      const organizationId = `ocfq-race-org-${suffix}`;
      const userId = `ocfq-race-user-${suffix}`;
      const customerId = `ocfq-race-customer-${suffix}`;

      await db.organization.create({
        data: { id: organizationId, name: "Race Tenant" }
      });

      await db.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          name: "Race User"
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
          title: "Yarışan teklif"
        });

        const quoteId = created.quote.id;

        await executeQuoteMarkWon({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `won-${suffix}`,
          quoteId
        });

        // Two genuinely concurrent conversion attempts for the SAME
        // quote, with two DIFFERENT idempotency keys (as if from two
        // different turns racing) — only one Order may ever exist.
        const [resultA, resultB] = await Promise.all([
          executeOrderCreateFromQuote({
            actorUserId: userId,
            organizationId,
            idempotencyKey: `race-a-${suffix}`,
            quoteId
          }),
          executeOrderCreateFromQuote({
            actorUserId: userId,
            organizationId,
            idempotencyKey: `race-b-${suffix}`,
            quoteId
          })
        ]);

        expect(resultA.order.id).toBe(resultB.order.id);
        expect(resultA.verified).toBe(true);
        expect(resultB.verified).toBe(true);

        const orderCount = await db.order.count({
          where: { organizationId, sourceQuoteId: quoteId }
        });

        expect(orderCount).toBe(1);
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
        await db.user.deleteMany({
          where: { id: userId }
        });
        await db.organization.deleteMany({
          where: { id: organizationId }
        });
      }
    }
  );
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
