import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/quote-update.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified quote.update action", () => {
  it("requires the typed quote.update implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("authorizes, mutates once, recomputes totals, and returns only a verified readback", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executeQuoteUpdate
    } = await import("../../src/lib/actions/quote-update");
    const {
      executeQuoteCreate
    } = await import("../../src/lib/actions/quote-create");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `qu-org-${suffix}`;
    const otherOrgId = `qu-other-org-${suffix}`;
    const userId = `qu-user-${suffix}`;
    const outsiderId = `qu-outsider-${suffix}`;
    const otherOrgUserId = `qu-other-user-${suffix}`;
    const customerId = `qu-customer-${suffix}`;
    const productId = `qu-product-${suffix}`;
    const otherOrgProductId = `qu-other-product-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Quote Update Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Quote Update User"
        },
        {
          id: outsiderId,
          email: `${outsiderId}@example.test`,
          name: "Outsider User"
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
      const created = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-${suffix}`,
        customerId,
        title: "Yıllık bakım teklifi",
        items: [
          {
            name: "Başlangıç kalemi",
            quantity: 1,
            unitPriceCents: 1000
          }
        ]
      });

      const quoteId = created.quote.id;
      const originalUpdatedAt = (
        await db.quote.findUniqueOrThrow({
          where: { id: quoteId }
        })
      ).updatedAt;

      const idempotencyKey = `update-${suffix}`;

      const first = await executeQuoteUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        quoteId,
        title: "Güncellenmiş başlık",
        specialTerms: "Peşin ödeme",
        generalDiscountBasisPoints: 2000,
        items: [
          {
            productServiceId: productId,
            name: "Danışmanlık",
            quantity: 2,
            unitPriceCents: 1000,
            vatRateBasisPoints: 2000
          }
        ]
      });

      expect(first.action).toBe("quote.update");
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.quote.title).toBe(
        "Güncellenmiş başlık"
      );
      expect(first.quote.items).toHaveLength(1);
      // 2x10.00, +20% VAT = 2400 cents, -20% general discount = 1920 -> 19.20
      expect(first.quote.amount).toBe(19.2);

      const persisted = await db.quote.findUnique({
        where: { id: quoteId },
        include: { items: true }
      });

      expect(persisted?.title).toBe(
        "Güncellenmiş başlık"
      );
      expect(persisted?.specialTerms).toBe(
        "Peşin ödeme"
      );
      expect(persisted?.items).toHaveLength(1);
      expect(Number(persisted?.amount)).toBe(19.2);

      const replay = await executeQuoteUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        quoteId,
        title: "Güncellenmiş başlık",
        specialTerms: "Peşin ödeme",
        generalDiscountBasisPoints: 2000,
        items: [
          {
            productServiceId: productId,
            name: "Danışmanlık",
            quantity: 2,
            unitPriceCents: 1000,
            vatRateBasisPoints: 2000
          }
        ]
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);

      const itemCountAfterReplay = await db.quoteItem.count(
        { where: { quoteId } }
      );

      expect(itemCountAfterReplay).toBe(1);

      await expect(
        executeQuoteUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          quoteId,
          title: "Çakışan farklı başlık"
        })
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT"
      });

      await expect(
        executeQuoteUpdate({
          actorUserId: outsiderId,
          organizationId,
          idempotencyKey: `unauthorized-${suffix}`,
          quoteId,
          title: "Yetkisiz güncelleme"
        })
      ).rejects.toMatchObject({
        code: "ORGANIZATION_ACCESS_DENIED"
      });

      await expect(
        executeQuoteUpdate({
          actorUserId: otherOrgUserId,
          organizationId: otherOrgId,
          idempotencyKey: `cross-tenant-${suffix}`,
          quoteId,
          title: "Cross tenant güncelleme"
        })
      ).rejects.toMatchObject({
        code: "QUOTE_NOT_FOUND"
      });

      await expect(
        executeQuoteUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `nonexistent-${suffix}`,
          quoteId: `does-not-exist-${suffix}`,
          title: "Yok teklif"
        })
      ).rejects.toMatchObject({
        code: "QUOTE_NOT_FOUND"
      });

      await expect(
        executeQuoteUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `cross-product-${suffix}`,
          quoteId,
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
        executeQuoteUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `invalid-item-${suffix}`,
          quoteId,
          items: [
            {
              name: "Negatif miktar",
              quantity: -1,
              unitPriceCents: 1000
            }
          ]
        })
      ).rejects.toMatchObject({
        code: "INVALID_QUOTE_ITEM"
      });

      await expect(
        executeQuoteUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `stale-${suffix}`,
          quoteId,
          expectedUpdatedAt:
            originalUpdatedAt.toISOString(),
          title: "Stale güncelleme"
        })
      ).rejects.toMatchObject({
        code: "QUOTE_VERSION_CONFLICT"
      });

      const stillUpdatedTitle = await db.quote.findUnique(
        { where: { id: quoteId } }
      );

      expect(stillUpdatedTitle?.title).toBe(
        "Güncellenmiş başlık"
      );

      await expect(
        executeQuoteUpdate({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `empty-${suffix}`,
          quoteId
        } as never)
      ).rejects.toThrow();

      const currentUpdatedAt = (
        await db.quote.findUniqueOrThrow({
          where: { id: quoteId }
        })
      ).updatedAt;

      const priorityOnly = await executeQuoteUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `terms-only-${suffix}`,
        quoteId,
        expectedUpdatedAt:
          currentUpdatedAt.toISOString(),
        deliveryTerm: "EXW"
      });

      expect(priorityOnly.quote.items).toHaveLength(
        1
      );
      // amount untouched since neither items nor
      // generalDiscountBasisPoints were part of this update
      expect(priorityOnly.quote.amount).toBe(19.2);

      const execution = await db.actionExecution.findUnique(
        {
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId,
              actionType: "quote.update",
              idempotencyKey
            }
          }
        }
      );

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.resourceId).toBe(quoteId);
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
          id: {
            in: [userId, outsiderId, otherOrgUserId]
          }
        }
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
