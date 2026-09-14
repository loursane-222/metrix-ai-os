import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/actions/quote-mark-won.ts"
);

const implementationExists = existsSync(implementationPath);

describe("verified quote.mark_won action", () => {
  it("requires the typed quote.mark_won implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("moves DRAFT to WON, verifies readback, replays safely, and stays tenant-safe", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const {
      executeQuoteMarkWon
    } = await import("../../src/lib/actions/quote-mark-won");
    const {
      executeQuoteCreate
    } = await import("../../src/lib/actions/quote-create");

    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `qmw-org-${suffix}`;
    const otherOrgId = `qmw-other-org-${suffix}`;
    const userId = `qmw-user-${suffix}`;
    const outsiderId = `qmw-outsider-${suffix}`;
    const otherOrgUserId = `qmw-other-user-${suffix}`;
    const customerId = `qmw-customer-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Quote Mark Won Tenant" },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Quote Mark Won User"
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

    try {
      const created = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `create-${suffix}`,
        customerId,
        title: "Yıllık bakım teklifi"
      });

      const quoteId = created.quote.id;
      expect(created.quote.status).toBe("DRAFT");

      const idempotencyKey = `won-${suffix}`;

      const first = await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        quoteId
      });

      expect(first.action).toBe("quote.mark_won");
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.quote.status).toBe("WON");
      expect(first.quote.id).toBe(quoteId);

      const persisted = await db.quote.findUnique({
        where: { id: quoteId }
      });

      expect(persisted?.status).toBe("WON");

      // replay: identical idempotencyKey + identical input
      const replay = await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        quoteId
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.quote.status).toBe("WON");

      // same key, would-be different input semantics (n/a fields here,
      // but the hash is still keyed on quoteId) — reusing the SAME
      // quoteId with the SAME key must never conflict; a conflict only
      // arises from a genuinely different quoteId under the same key.
      await expect(
        executeQuoteMarkWon({
          actorUserId: userId,
          organizationId,
          idempotencyKey,
          quoteId: `${quoteId}-different`
        })
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT"
      });

      // already-WON quote, called again with a FRESH idempotency key:
      // safe no-op success, not an error.
      const alreadyWonKey = `already-won-${suffix}`;

      const alreadyWon = await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey: alreadyWonKey,
        quoteId
      });

      expect(alreadyWon.verified).toBe(true);
      expect(alreadyWon.quote.status).toBe("WON");

      const stillOneQuote = await db.quote.count({
        where: { id: quoteId, status: "WON" }
      });

      expect(stillOneQuote).toBe(1);

      // foreign user (same org membership check fails)
      await expect(
        executeQuoteMarkWon({
          actorUserId: outsiderId,
          organizationId,
          idempotencyKey: `unauthorized-${suffix}`,
          quoteId
        })
      ).rejects.toMatchObject({
        code: "ORGANIZATION_ACCESS_DENIED"
      });

      // cross-tenant quoteId
      await expect(
        executeQuoteMarkWon({
          actorUserId: otherOrgUserId,
          organizationId: otherOrgId,
          idempotencyKey: `cross-tenant-${suffix}`,
          quoteId
        })
      ).rejects.toMatchObject({
        code: "QUOTE_NOT_FOUND"
      });

      // missing quote
      await expect(
        executeQuoteMarkWon({
          actorUserId: userId,
          organizationId,
          idempotencyKey: `missing-${suffix}`,
          quoteId: `does-not-exist-${suffix}`
        })
      ).rejects.toMatchObject({
        code: "QUOTE_NOT_FOUND"
      });

      const missingExecution =
        await db.actionExecution.findUnique({
          where: {
            organizationId_actionType_idempotencyKey: {
              organizationId,
              actionType: "quote.mark_won",
              idempotencyKey: `missing-${suffix}`
            }
          }
        });

      expect(missingExecution).toBeNull();

      const execution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "quote.mark_won",
            idempotencyKey
          }
        }
      });

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.resourceId).toBe(quoteId);
      expect(execution?.verifiedAt).not.toBeNull();
    } finally {
      await db.actionExecution.deleteMany({
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
          id: { in: [userId, outsiderId, otherOrgUserId] }
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
