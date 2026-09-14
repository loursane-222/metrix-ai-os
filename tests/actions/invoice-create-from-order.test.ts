import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/invoice-create-from-order.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified invoice.create_from_order action", () => {
  it("requires the typed invoice.create_from_order implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("converts exactly one DRAFT order into exactly one DRAFT invoice with a full deterministic commercial/item snapshot, idempotently and tenant-safely", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executeInvoiceCreateFromOrder
    } = await import(
      "../../src/lib/actions/invoice-create-from-order"
    );
    const {
      executeQuoteCreate
    } = await import("../../src/lib/actions/quote-create");
    const {
      executeQuoteMarkWon
    } = await import("../../src/lib/actions/quote-mark-won");
    const {
      executeOrderCreateFromQuote
    } = await import(
      "../../src/lib/actions/order-create-from-quote"
    );

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `icfo-org-${suffix}`;
    const otherOrgId = `icfo-other-org-${suffix}`;
    const userId = `icfo-user-${suffix}`;
    const otherOrgUserId = `icfo-other-user-${suffix}`;
    const customerId = `icfo-customer-${suffix}`;
    const productId = `icfo-product-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Invoice Create Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Invoice Create User"
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
      const createdQuote = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-quote-${suffix}`,
        customerId,
        title: "Yıllık bakım siparişi",
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

      const quoteId = createdQuote.quote.id;

      await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `won-${suffix}`,
        quoteId
      });

      const orderResult = await executeOrderCreateFromQuote({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `convert-${suffix}`,
        quoteId
      });

      const orderId = orderResult.order.id;

      // Deterministic totals derived only from the persisted OrderItems:
      // net = (1000*2*0.9) + (500*3) = 1800 + 1500 = 3300 cents
      // gross(VAT-incl.) = (1800*1.2) + 1500 = 2160 + 1500 = 3660 cents
      // after 10% general discount: net=2970, gross(total)=3294, tax=324
      const expectedAmount = 29.7;
      const expectedTaxAmount = 3.24;
      const expectedTotalAmount = 32.94;

      // Quote never reread: mutate the source Quote after Order creation.
      // The Invoice must snapshot from the Order/OrderItem truth only,
      // never from this now-stale Quote.
      await db.quote.update({
        where: { id: quoteId },
        data: { title: "BAŞKA BİR BAŞLIK — bu asla görünmemeli" }
      });

      const idempotencyKey = `invoice-${suffix}`;

      const first = await executeInvoiceCreateFromOrder({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        orderId
      });

      expect(first.action).toBe(
        "invoice.create_from_order"
      );
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.invoice.sourceOrderId).toBe(orderId);
      expect(first.invoice.status).toBe("DRAFT");
      expect(first.invoice.customerId).toBe(customerId);
      expect(first.invoice.title).toBe(
        "Yıllık bakım siparişi"
      );
      expect(first.invoice.currency).toBe("TRY");
      expect(first.invoice.amount).toBeCloseTo(
        expectedAmount,
        6
      );
      expect(first.invoice.taxAmount).toBeCloseTo(
        expectedTaxAmount,
        6
      );
      expect(first.invoice.totalAmount).toBeCloseTo(
        expectedTotalAmount,
        6
      );
      expect(
        first.invoice.amount + first.invoice.taxAmount
      ).toBeCloseTo(first.invoice.totalAmount, 6);
      expect(first.invoice.totalAmount).toBeCloseTo(
        orderResult.order.amount ?? NaN,
        6
      );
      expect(first.invoice.invoiceNumber).toMatch(
        /^FTR-\d{4}-\d{4}$/
      );
      expect(first.invoice.items).toHaveLength(2);

      expect(first.invoice.items[0]).toMatchObject({
        orderItemId: orderResult.order.items[0]?.id,
        productServiceId: productId,
        name: "Danışmanlık",
        unit: "saat",
        quantity: 2,
        unitPriceCents: "1000",
        discountBasisPoints: 1000,
        vatRateBasisPoints: 2000,
        lineTotalCents:
          orderResult.order.items[0]?.lineTotalCents
      });

      expect(first.invoice.items[1]).toMatchObject({
        orderItemId: orderResult.order.items[1]?.id,
        productServiceId: null,
        name: "Ek kalem",
        quantity: 3,
        unitPriceCents: "500",
        lineTotalCents:
          orderResult.order.items[1]?.lineTotalCents
      });

      const persistedInvoice = await db.invoice.findUnique(
        {
          where: { id: first.invoice.id },
          include: { items: true }
        }
      );

      expect(persistedInvoice?.organizationId).toBe(
        organizationId
      );
      expect(persistedInvoice?.items).toHaveLength(2);

      const onlyOneInvoice = await db.invoice.count({
        where: { organizationId, sourceOrderId: orderId }
      });
      expect(onlyOneInvoice).toBe(1);

      // --- exact replay: same idempotencyKey ---
      const replay = await executeInvoiceCreateFromOrder({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        orderId
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.invoice.id).toBe(first.invoice.id);

      const stillOneAfterReplay = await db.invoice.count({
        where: { organizationId, sourceOrderId: orderId }
      });
      expect(stillOneAfterReplay).toBe(1);

      // --- cross-turn duplicate: SAME orderId, DIFFERENT
      // idempotencyKey — must resolve to the SAME invoice, never a
      // second one (one-full-invoice-per-order policy).
      const crossTurn = await executeInvoiceCreateFromOrder({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `cross-turn-${suffix}`,
        orderId
      });

      expect(crossTurn.verified).toBe(true);
      expect(crossTurn.replayed).toBe(true);
      expect(crossTurn.invoice.id).toBe(first.invoice.id);

      const stillOneAfterCrossTurn = await db.invoice.count(
        {
          where: { organizationId, sourceOrderId: orderId }
        }
      );
      expect(stillOneAfterCrossTurn).toBe(1);

      const executionsForInvoice =
        await db.actionExecution.findMany({
          where: {
            organizationId,
            actionType: "invoice.create_from_order",
            resourceId: first.invoice.id
          }
        });

      expect(executionsForInvoice).toHaveLength(2);
      expect(
        executionsForInvoice.every(
          e => e.status === "VERIFIED"
        )
      ).toBe(true);

      // --- foreign org cannot see/invoice the order ---
      await expect(
        executeInvoiceCreateFromOrder({
          actorUserId: otherOrgUserId,
          organizationId: otherOrgId,
          idempotencyKey: `cross-tenant-${suffix}`,
          orderId
        })
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });

      const noCrossTenantLeak = await db.invoice.count({
        where: { organizationId: otherOrgId }
      });
      expect(noCrossTenantLeak).toBe(0);

      const execution = await db.actionExecution.findUnique(
        {
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId,
              actionType: "invoice.create_from_order",
              idempotencyKey
            }
          }
        }
      );

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.verifiedAt).not.toBeNull();
    } finally {
      await db.invoiceItem.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });
      await db.invoice.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });
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
    "handles a genuine concurrent race on the same Order safely: exactly one Invoice is ever created",
    async () => {
      expect(implementationExists).toBe(true);

      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeInvoiceCreateFromOrder
      } = await import(
        "../../src/lib/actions/invoice-create-from-order"
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
        `${Date.now()}-${Math.random().toString(36).slice(2)}-race`;

      const organizationId = `icfo-race-org-${suffix}`;
      const userId = `icfo-race-user-${suffix}`;
      const customerId = `icfo-race-customer-${suffix}`;

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
        const createdQuote = await executeQuoteCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `create-quote-${suffix}`,
          customerId,
          title: "Yarışan sipariş",
          items: [
            {
              name: "Tek kalem",
              quantity: 1,
              unitPriceCents: 10_000
            }
          ]
        });

        const quoteId = createdQuote.quote.id;

        await executeQuoteMarkWon({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `won-${suffix}`,
          quoteId
        });

        const orderResult =
          await executeOrderCreateFromQuote({
            actorUserId: userId,
            organizationId,
            idempotencyKey: `convert-${suffix}`,
            quoteId
          });

        const orderId = orderResult.order.id;

        // Two genuinely concurrent invoice creation attempts for the
        // SAME order, with two DIFFERENT idempotency keys (as if from
        // two different turns racing) — only one Invoice may ever
        // exist. There is no DB unique constraint on sourceOrderId
        // (deliberately — see spec section 9), so this proves the
        // SELECT ... FOR UPDATE row-lock discipline actually works.
        const [resultA, resultB] = await Promise.all([
          executeInvoiceCreateFromOrder({
            actorUserId: userId,
            organizationId,
            idempotencyKey: `race-a-${suffix}`,
            orderId
          }),
          executeInvoiceCreateFromOrder({
            actorUserId: userId,
            organizationId,
            idempotencyKey: `race-b-${suffix}`,
            orderId
          })
        ]);

        expect(resultA.invoice.id).toBe(
          resultB.invoice.id
        );
        expect(resultA.verified).toBe(true);
        expect(resultB.verified).toBe(true);

        const invoiceCount = await db.invoice.count({
          where: { organizationId, sourceOrderId: orderId }
        });

        expect(invoiceCount).toBe(1);
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
        await db.user.deleteMany({
          where: { id: userId }
        });
        await db.organization.deleteMany({
          where: { id: organizationId }
        });
      }
    }
  );

  it(
    "rejects an Order with no items and never creates a partial invoice",
    async () => {
      expect(implementationExists).toBe(true);

      if (!implementationExists) return;

      const { db } = await import("../../src/lib/db");
      const {
        executeInvoiceCreateFromOrder
      } = await import(
        "../../src/lib/actions/invoice-create-from-order"
      );

      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2)}-empty`;

      const organizationId = `icfo-empty-org-${suffix}`;
      const userId = `icfo-empty-user-${suffix}`;
      const customerId = `icfo-empty-customer-${suffix}`;

      await db.organization.create({
        data: { id: organizationId, name: "Empty Order Tenant" }
      });

      await db.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          name: "Empty Order User"
        }
      });

      await db.organizationMember.create({
        data: { organizationId, userId, role: "MEMBER" }
      });

      await db.customer.create({
        data: {
          id: customerId,
          organizationId,
          name: "Boş Sipariş Müşterisi"
        }
      });

      try {
        const quote = await db.quote.create({
          data: {
            organizationId,
            customerId,
            customerName: "Boş Sipariş Müşterisi",
            title: "Kalemsiz teklif",
            status: "WON"
          }
        });

        const order = await db.order.create({
          data: {
            organizationId,
            customerId,
            sourceQuoteId: quote.id,
            orderNumber: "SIP-EMPTY",
            customerName: "Boş Sipariş Müşterisi",
            title: "Kalemsiz sipariş",
            amount: null
          }
        });

        await expect(
          executeInvoiceCreateFromOrder({
            actorUserId: userId,
            organizationId,
            idempotencyKey: `empty-${suffix}`,
            orderId: order.id
          })
        ).rejects.toMatchObject({
          code: "ORDER_HAS_NO_ITEMS"
        });

        const invoiceCount = await db.invoice.count({
          where: { organizationId, sourceOrderId: order.id }
        });

        expect(invoiceCount).toBe(0);
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
