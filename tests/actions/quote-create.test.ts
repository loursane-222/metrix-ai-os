import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/quote-create.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified quote.create action", () => {
  it("requires the typed quote.create implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("authorizes, computes canonical totals, and returns only a verified readback", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executeQuoteCreate
    } = await import("../../src/lib/actions/quote-create");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `qc-org-${suffix}`;
    const otherOrgId = `qc-other-org-${suffix}`;
    const userId = `qc-user-${suffix}`;
    const customerId = `qc-customer-${suffix}`;
    const otherOrgCustomerId = `qc-other-customer-${suffix}`;
    const productId = `qc-product-${suffix}`;
    const otherOrgProductId = `qc-other-product-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Quote Create Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Quote Create User"
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

    await db.customer.create({
      data: {
        id: otherOrgCustomerId,
        organizationId: otherOrgId,
        name: "Rakip Şirket"
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

    await db.productService.create({
      data: {
        id: otherOrgProductId,
        organizationId: otherOrgId,
        name: "Rakip Ürün",
        type: "PRODUCT",
        status: "ACTIVE"
      }
    });

    try {
      const idempotencyKey = `create-${suffix}`;

      const first = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        customerId,
        title: "Yıllık bakım teklifi",
        generalDiscountBasisPoints: 1000,
        items: [
          {
            productServiceId: productId,
            name: "Danışmanlık",
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

      expect(first.action).toBe("quote.create");
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.quote.customerId).toBe(customerId);
      expect(first.quote.customerName).toBe(
        "Zensoft Teknoloji A.Ş."
      );
      expect(first.quote.status).toBe("DRAFT");
      expect(first.quote.items).toHaveLength(2);

      // line 1: 2x10.00, 10% discount, 20% VAT -> net 1800, +VAT 2160
      expect(first.quote.items[0]?.lineTotalCents).toBe(
        "2160"
      );
      // line 2: 3x5.00, no discount/vat -> 1500
      expect(first.quote.items[1]?.lineTotalCents).toBe(
        "1500"
      );

      // sum 3660, general discount 10% -> 3294 cents -> 32.94
      expect(first.quote.amount).toBe(32.94);

      const persisted = await db.quote.findUnique({
        where: { id: first.quote.id },
        include: { items: true }
      });

      expect(persisted?.organizationId).toBe(
        organizationId
      );
      expect(Number(persisted?.amount)).toBe(32.94);
      expect(persisted?.items).toHaveLength(2);

      const replay = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        customerId,
        title: "Yıllık bakım teklifi",
        generalDiscountBasisPoints: 1000,
        items: [
          {
            productServiceId: productId,
            name: "Danışmanlık",
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

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.quote.id).toBe(first.quote.id);

      const quoteCount = await db.quote.count({
        where: { organizationId, title: "Yıllık bakım teklifi" }
      });

      expect(quoteCount).toBe(1);

      await expect(
        executeQuoteCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          customerId,
          title: "Farklı başlık aynı anahtar"
        })
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT"
      });

      await expect(
        executeQuoteCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `cross-customer-${suffix}`,
          customerId: otherOrgCustomerId,
          title: "Yetkisiz müşteri teklifi"
        })
      ).rejects.toMatchObject({
        code: "CUSTOMER_NOT_FOUND"
      });

      const crossCustomerCount = await db.quote.count({
        where: {
          organizationId,
          title: "Yetkisiz müşteri teklifi"
        }
      });

      expect(crossCustomerCount).toBe(0);

      await expect(
        executeQuoteCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `cross-product-${suffix}`,
          customerId,
          title: "Yetkisiz ürün teklifi",
          items: [
            {
              productServiceId: otherOrgProductId,
              name: "Rakip Ürün",
              quantity: 1,
              unitPriceCents: 1000
            }
          ]
        })
      ).rejects.toMatchObject({
        code: "PRODUCT_SERVICE_NOT_FOUND"
      });

      await expect(
        executeQuoteCreate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `unknown-product-${suffix}`,
          customerId,
          title: "Bilinmeyen ürün teklifi",
          items: [
            {
              productServiceId: `does-not-exist-${suffix}`,
              name: "Yok",
              quantity: 1,
              unitPriceCents: 1000
            }
          ]
        })
      ).rejects.toMatchObject({
        code: "PRODUCT_SERVICE_NOT_FOUND"
      });

      const unauthorizedQuoteCount = await db.quote.count(
        {
          where: { organizationId, title: "Yetkisiz ürün teklifi" }
        }
      );

      expect(unauthorizedQuoteCount).toBe(0);

      const amountOnlyResult = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `amount-only-${suffix}`,
        customerId,
        title: "Kalemsiz teklif",
        amount: 15000
      });

      expect(amountOnlyResult.quote.amount).toBe(
        15000
      );
      expect(amountOnlyResult.quote.items).toHaveLength(
        0
      );

      const execution = await db.actionExecution.findUnique(
        {
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId,
              actionType: "quote.create",
              idempotencyKey
            }
          }
        }
      );

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.resourceId).toBe(first.quote.id);
      expect(execution?.verifiedAt).not.toBeNull();
    } finally {
      await db.quoteItem.deleteMany({
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

      await db.quote.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.productService.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.customer.deleteMany({
        where: {
          organizationId: {
            in: [organizationId, otherOrgId]
          }
        }
      });

      await db.organizationMember.deleteMany({
        where: { organizationId }
      });

      await db.user.deleteMany({
        where: { id: userId }
      });

      await db.organization.deleteMany({
        where: {
          id: { in: [organizationId, otherOrgId] }
        }
      });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
