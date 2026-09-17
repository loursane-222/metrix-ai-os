import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const implementationPath = join(process.cwd(), "src/lib/actions/document-generate.ts");

const implementationExists = existsSync(implementationPath);

describe("verified document.generate action", () => {
  it("requires the typed document.generate implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("generates a reproducible, version-aware, tenant-scoped document artifact from a Quote and an Invoice source", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const { db } = await import("../../src/lib/db");
    const { executeDocumentGenerate } = await import("../../src/lib/actions/document-generate");
    const { executeQuoteCreate } = await import("../../src/lib/actions/quote-create");
    const { executeQuoteUpdate } = await import("../../src/lib/actions/quote-update");
    const { executeQuoteMarkWon } = await import("../../src/lib/actions/quote-mark-won");
    const { executeOrderCreateFromQuote } = await import("../../src/lib/actions/order-create-from-quote");
    const { executeInvoiceCreateFromOrder } = await import("../../src/lib/actions/invoice-create-from-order");

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organizationId = `doc-org-${suffix}`;
    const otherOrgId = `doc-other-org-${suffix}`;
    const userId = `doc-user-${suffix}`;
    const otherOrgUserId = `doc-other-org-user-${suffix}`;
    const customerId = `doc-customer-${suffix}`;

    await db.organization.createMany({
      data: [
        { id: organizationId, name: "Belge Test A.Ş." },
        { id: otherOrgId, name: "Other Tenant" }
      ]
    });

    await db.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.test`, name: "Doc User" },
        { id: otherOrgUserId, email: `${otherOrgUserId}@example.test`, name: "Other Org User" }
      ]
    });

    await db.organizationMember.createMany({
      data: [
        { organizationId, userId, role: "MEMBER" },
        { organizationId: otherOrgId, userId: otherOrgUserId, role: "MEMBER" }
      ]
    });

    await db.customer.create({
      data: { id: customerId, organizationId, name: "Zensoft Teknoloji A.Ş." }
    });

    try {
      const quote = await executeQuoteCreate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `quote-create-${suffix}`,
        customerId,
        title: "Yıllık bakım teklifi",
        items: [
          { name: "Danışmanlık", unit: "saat", quantity: 2, unitPriceCents: 1000, vatRateBasisPoints: 2000 }
        ]
      });

      const quoteId = quote.quote.id;
      const idempotencyKey = `doc-generate-${suffix}`;

      const first = await executeDocumentGenerate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        sourceType: "Quote",
        sourceId: quoteId
      });

      expect(first.action).toBe("document.generate");
      expect(first.status).toBe("VERIFIED");
      expect(first.verified).toBe(true);
      expect(first.replayed).toBe(false);
      expect(first.document.kind).toBe("OFFER");
      expect(first.document.sourceType).toBe("Quote");
      expect(first.document.sourceId).toBe(quoteId);
      expect(first.document.version).toBe(1);
      expect(first.document.previewHtml).toContain("Zensoft Teknoloji A.Ş.");
      expect(first.document.previewHtml).toContain("Danışmanlık");
      expect(first.document.previewHtml).toContain("Belge Test A.Ş.");

      const persisted = await db.artifact.findUnique({ where: { id: first.document.artifactId } });
      expect(persisted?.organizationId).toBe(organizationId);
      expect(persisted?.version).toBe(1);

      // --- exact replay: same idempotencyKey ---
      const replay = await executeDocumentGenerate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        sourceType: "Quote",
        sourceId: quoteId
      });

      expect(replay.verified).toBe(true);
      expect(replay.replayed).toBe(true);
      expect(replay.document.artifactId).toBe(first.document.artifactId);

      // --- same idempotency key, conflicting payload ---
      await expect(executeDocumentGenerate({
        actorUserId: userId,
        organizationId,
        idempotencyKey,
        sourceType: "Invoice",
        sourceId: "does-not-matter"
      })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

      // --- cross-turn, unchanged source: different idempotencyKey resolves to the SAME artifact version ---
      const crossTurn = await executeDocumentGenerate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `doc-generate-cross-turn-${suffix}`,
        sourceType: "Quote",
        sourceId: quoteId
      });

      expect(crossTurn.replayed).toBe(false);
      expect(crossTurn.document.artifactId).toBe(first.document.artifactId);
      expect(crossTurn.document.version).toBe(1);

      const stillOneVersion = await db.artifact.count({
        where: { organizationId, kind: "OFFER", sourceType: "Quote", sourceId: quoteId }
      });
      expect(stillOneVersion).toBe(1);

      // --- source changes: regeneration allocates a NEW version ---
      await executeQuoteUpdate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `quote-update-${suffix}`,
        quoteId,
        notes: "Fiyat revize edildi"
      });

      const regenerated = await executeDocumentGenerate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `doc-generate-v2-${suffix}`,
        sourceType: "Quote",
        sourceId: quoteId
      });

      expect(regenerated.document.version).toBe(2);
      expect(regenerated.document.artifactId).not.toBe(first.document.artifactId);
      expect(regenerated.document.previewHtml).toContain("Fiyat revize edildi");

      const twoVersions = await db.artifact.count({
        where: { organizationId, kind: "OFFER", sourceType: "Quote", sourceId: quoteId }
      });
      expect(twoVersions).toBe(2);

      // --- cross-tenant rejection ---
      await expect(executeDocumentGenerate({
        actorUserId: otherOrgUserId,
        organizationId,
        idempotencyKey: `doc-generate-cross-tenant-${suffix}`,
        sourceType: "Quote",
        sourceId: quoteId
      })).rejects.toMatchObject({ code: "ORGANIZATION_ACCESS_DENIED" });

      await expect(executeDocumentGenerate({
        actorUserId: otherOrgUserId,
        organizationId: otherOrgId,
        idempotencyKey: `doc-generate-foreign-${suffix}`,
        sourceType: "Quote",
        sourceId: quoteId
      })).rejects.toMatchObject({ code: "DOCUMENT_SOURCE_NOT_FOUND" });

      // --- source not found ---
      await expect(executeDocumentGenerate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `doc-generate-missing-${suffix}`,
        sourceType: "Quote",
        sourceId: `nonexistent-${suffix}`
      })).rejects.toMatchObject({ code: "DOCUMENT_SOURCE_NOT_FOUND" });

      const noExecutionForMissing = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "document.generate",
            idempotencyKey: `doc-generate-missing-${suffix}`
          }
        }
      });
      expect(noExecutionForMissing).toBeNull();

      const execution = await db.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId,
            actionType: "document.generate",
            idempotencyKey
          }
        }
      });

      expect(execution?.status).toBe("VERIFIED");
      expect(execution?.resourceId).toBe(first.document.artifactId);
      expect(execution?.verifiedAt).not.toBeNull();

      // --- Invoice source, end to end via WON quote -> order -> invoice ---
      await executeQuoteMarkWon({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `quote-won-${suffix}`,
        quoteId
      });

      const order = await executeOrderCreateFromQuote({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `order-create-${suffix}`,
        quoteId
      });

      const invoice = await executeInvoiceCreateFromOrder({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `invoice-create-${suffix}`,
        orderId: order.order.id
      });

      const invoiceDocument = await executeDocumentGenerate({
        actorUserId: userId,
        organizationId,
        idempotencyKey: `doc-generate-invoice-${suffix}`,
        sourceType: "Invoice",
        sourceId: invoice.invoice.id
      });

      expect(invoiceDocument.document.kind).toBe("INVOICE");
      expect(invoiceDocument.document.version).toBe(1);
      expect(invoiceDocument.document.previewHtml).toContain("Zensoft Teknoloji A.Ş.");
      expect(invoiceDocument.document.previewHtml).toContain(invoice.invoice.invoiceNumber);
    } finally {
      await db.actionExecution.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.artifact.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.payment.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.invoiceItem.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.invoice.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.orderItem.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.order.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.quoteItem.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.quote.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.customer.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({ where: { organizationId: { in: [organizationId, otherOrgId] } } });
      await db.user.deleteMany({ where: { id: { in: [userId, otherOrgUserId] } } });
      await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrgId] } } });
    }
  });
});

afterAll(async () => {
  if (!implementationExists) return;

  const { db } = await import("../../src/lib/db");
  await db.$disconnect();
});
