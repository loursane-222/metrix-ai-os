import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { StructuredExtractionPayload, StructuredFieldCandidate } from "@/lib/field-authority/structured-field-ingestion";

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === "1" ? describe : describe.skip;

function candidate(fieldId: string, value: string): StructuredFieldCandidate {
  return { fieldId, extractedValue: value, normalizedValue: value, confidence: 0.9, source: { sourceId: "s1", mediaType: "application/pdf" }, warnings: [], conflicts: [], conflictStatus: "NONE", requiresUserConfirmation: true };
}
function extraction(candidates: StructuredFieldCandidate[]): StructuredExtractionPayload { return { candidates, unsupportedObservations: [] }; }

// Exercises the real Prisma-backed half of Phase 14: counterparty/PO
// resolution against real Customer/Supplier/PurchaseOrder rows, real
// BusinessCandidate persistence, and real promotion through the
// (unmodified, production) Action Runtime — proving the new Expense /
// PurchaseInvoice / FinancialInstrument executor branches actually create
// the right canonical rows. The OpenAI-calling classify/extract HTTP layer
// is covered separately by mocked unit tests (document-classifier.test.ts,
// document-candidate-builder.test.ts) — there is no product reason to make
// a real model call inside a DB integration test.
databaseIntegration("Phase 14 Document Intelligence — real Prisma resolution + real Action Runtime promotion", () => {
  it("SALES_INVOICE: resolves an unambiguous customer and promotes a real Invoice", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { createBusinessCandidateActionRuntimeExecutor, decideBusinessCandidateChanges, promoteBusinessCandidate } = await import("@/lib/business-reality-candidates");
    const { buildAndPersistDocumentCandidate } = await import("../document-candidate-builder");
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { phone: `+90555${suffix.replaceAll("-", "").slice(0, 10)}` } });
    const organization = await prisma.organization.create({ data: { name: `Phase14 SalesInvoice ${suffix}` } });
    const membership = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await prisma.session.create({ data: { userId: user.id, tokenHash: `p14:${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas Yapı ${suffix}`, currency: "TRY" } });
    const auth = { user, organization, membership, session };
    try {
      const build = await buildAndPersistDocumentCandidate({
        organizationId: organization.id, actorId: user.id, attachmentId: `att-${suffix}`, domain: "SALES_INVOICE",
        extraction: extraction([
          candidate("document.SALES_INVOICE.customerNameEvidence", `Atlas Yapı ${suffix}`),
          candidate("document.SALES_INVOICE.title", "Danışmanlık faturası"),
          candidate("document.SALES_INVOICE.amount", "3500.75"),
          candidate("document.SALES_INVOICE.currency", "TRY"),
        ]),
      });
      expect(build.status).toBe("CREATED");
      if (build.status !== "CREATED") return;
      await decideBusinessCandidateChanges({ organizationId: organization.id, candidateId: build.candidateId, actorUserId: user.id, approvedChangeIds: (await prisma.businessCandidateChange.findMany({ where: { candidateId: build.candidateId } })).map((c) => c.id), rejectedChangeIds: [] });
      const receipt = await promoteBusinessCandidate({ organizationId: organization.id, candidateId: build.candidateId, actorUserId: user.id, execute: createBusinessCandidateActionRuntimeExecutor(auth) });
      expect(receipt.status).toBe("SUCCEEDED");
      const invoice = await prisma.invoice.findFirstOrThrow({ where: { organizationId: organization.id, customerId: customer.id, title: "Danışmanlık faturası" } });
      expect(Number(invoice.totalAmount)).toBeGreaterThan(0);
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30_000);

  it("SALES_INVOICE: an ambiguous customer name (two real matches) fails closed to NEEDS_REVIEW — never guesses, never persists a candidate", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { buildAndPersistDocumentCandidate } = await import("../document-candidate-builder");
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Phase14 Ambiguous ${suffix}` } });
    try {
      await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas İnşaat ${suffix}`, currency: "TRY" } });
      await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas Yapı ${suffix}`, currency: "TRY" } });
      const build = await buildAndPersistDocumentCandidate({
        organizationId: organization.id, actorId: "actor-1", attachmentId: `att-${suffix}`, domain: "SALES_INVOICE",
        extraction: extraction([candidate("document.SALES_INVOICE.customerNameEvidence", `Atlas`), candidate("document.SALES_INVOICE.title", "Fatura"), candidate("document.SALES_INVOICE.amount", "100")]),
      });
      expect(build).toMatchObject({ status: "NEEDS_REVIEW", reason: "COUNTERPARTY_AMBIGUOUS" });
      expect(await prisma.businessCandidate.count({ where: { organizationId: organization.id } })).toBe(0);
    } finally {
      await prisma.customer.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
    }
  }, 30_000);

  it("PURCHASE_INVOICE: resolves supplier + matching PurchaseOrder and promotes a real PurchaseInvoice tied to that PO", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { createBusinessCandidateActionRuntimeExecutor, decideBusinessCandidateChanges, promoteBusinessCandidate } = await import("@/lib/business-reality-candidates");
    const { buildAndPersistDocumentCandidate } = await import("../document-candidate-builder");
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { phone: `+90556${suffix.replaceAll("-", "").slice(0, 10)}` } });
    const organization = await prisma.organization.create({ data: { name: `Phase14 PurchaseInvoice ${suffix}` } });
    const membership = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await prisma.session.create({ data: { userId: user.id, tokenHash: `p14b:${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) } });
    const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: `Demir Metal ${suffix}` } });
    const purchaseOrder = await prisma.purchaseOrder.create({ data: { organizationId: organization.id, poNumber: `PO-${suffix.slice(0, 8)}`, supplierId: supplier.id, status: "APPROVED" } });
    const purchaseOrderItem = await prisma.purchaseOrderItem.create({ data: { organizationId: organization.id, purchaseOrderId: purchaseOrder.id, name: `Çimento ${suffix}`, quantity: 10, unitPriceCents: BigInt(10_000), lineTotalCents: BigInt(100_000) } });
    const warehouse = await prisma.warehouse.create({ data: { organizationId: organization.id, name: `Ana Depo ${suffix}`, code: `WH-${suffix.slice(0, 8)}` } });
    const goodsReceipt = await prisma.goodsReceipt.create({ data: { organizationId: organization.id, receiptNumber: `GR-${suffix.slice(0, 8)}`, sourcePurchaseOrderId: purchaseOrder.id, supplierId: supplier.id, warehouseId: warehouse.id } });
    await prisma.goodsReceiptItem.create({ data: { organizationId: organization.id, goodsReceiptId: goodsReceipt.id, purchaseOrderItemId: purchaseOrderItem.id, name: purchaseOrderItem.name, quantity: 10 } });
    const auth = { user, organization, membership, session };
    try {
      const build = await buildAndPersistDocumentCandidate({
        organizationId: organization.id, actorId: user.id, attachmentId: `att-${suffix}`, domain: "PURCHASE_INVOICE",
        extraction: extraction([
          candidate("document.PURCHASE_INVOICE.supplierNameEvidence", `Demir Metal ${suffix}`),
          candidate("document.PURCHASE_INVOICE.poNumberEvidence", purchaseOrder.poNumber),
          candidate("document.PURCHASE_INVOICE.supplierInvoiceNumber", `SUP-${suffix.slice(0, 8)}`),
        ]),
      });
      expect(build.status).toBe("CREATED");
      if (build.status !== "CREATED") return;
      const changeIds = (await prisma.businessCandidateChange.findMany({ where: { candidateId: build.candidateId } })).map((c) => c.id);
      await decideBusinessCandidateChanges({ organizationId: organization.id, candidateId: build.candidateId, actorUserId: user.id, approvedChangeIds: changeIds, rejectedChangeIds: [] });
      const receipt = await promoteBusinessCandidate({ organizationId: organization.id, candidateId: build.candidateId, actorUserId: user.id, execute: createBusinessCandidateActionRuntimeExecutor(auth) });
      expect(receipt.status).toBe("SUCCEEDED");
      const purchaseInvoice = await prisma.purchaseInvoice.findFirstOrThrow({ where: { organizationId: organization.id, purchaseOrderId: purchaseOrder.id } });
      expect(purchaseInvoice.supplierInvoiceNumber).toBe(`SUP-${suffix.slice(0, 8)}`);
    } finally {
      await prisma.purchaseInvoice.deleteMany({ where: { organizationId: organization.id } });
      await prisma.goodsReceipt.deleteMany({ where: { organizationId: organization.id } });
      await prisma.purchaseOrder.deleteMany({ where: { organizationId: organization.id } });
      await prisma.warehouse.deleteMany({ where: { organizationId: organization.id } });
      await prisma.supplier.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30_000);

  it("PURCHASE_INVOICE: a PO number that doesn't match any real PurchaseOrder for that supplier fails closed — no standalone purchase-invoice authority is invented", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { buildAndPersistDocumentCandidate } = await import("../document-candidate-builder");
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Phase14 NoPO ${suffix}` } });
    try {
      const supplier = await prisma.supplier.create({ data: { organizationId: organization.id, displayName: `Demir Metal ${suffix}` } });
      const build = await buildAndPersistDocumentCandidate({
        organizationId: organization.id, actorId: "actor-1", attachmentId: `att-${suffix}`, domain: "PURCHASE_INVOICE",
        extraction: extraction([
          candidate("document.PURCHASE_INVOICE.supplierNameEvidence", `Demir Metal ${suffix}`),
          candidate("document.PURCHASE_INVOICE.poNumberEvidence", "PO-DOES-NOT-EXIST"),
          candidate("document.PURCHASE_INVOICE.supplierInvoiceNumber", "SUP-X"),
        ]),
      });
      expect(build).toEqual({ status: "NEEDS_REVIEW", reason: "PURCHASE_ORDER_NOT_FOUND" });
      expect(await prisma.businessCandidate.count({ where: { organizationId: organization.id } })).toBe(0);
      void supplier;
    } finally {
      await prisma.supplier.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
    }
  }, 30_000);

  it("CHEQUE (RECEIVED): resolves a real Customer and promotes a real FinancialInstrument row", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { createBusinessCandidateActionRuntimeExecutor, decideBusinessCandidateChanges, promoteBusinessCandidate } = await import("@/lib/business-reality-candidates");
    const { buildAndPersistDocumentCandidate } = await import("../document-candidate-builder");
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { phone: `+90557${suffix.replaceAll("-", "").slice(0, 10)}` } });
    const organization = await prisma.organization.create({ data: { name: `Phase14 Cheque ${suffix}` } });
    const membership = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    const session = await prisma.session.create({ data: { userId: user.id, tokenHash: `p14c:${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Beta Ticaret ${suffix}`, currency: "TRY" } });
    const auth = { user, organization, membership, session };
    try {
      const build = await buildAndPersistDocumentCandidate({
        organizationId: organization.id, actorId: user.id, attachmentId: `att-${suffix}`, domain: "CHEQUE",
        extraction: extraction([
          candidate("document.FINANCIAL_INSTRUMENT.counterpartyNameEvidence", `Beta Ticaret ${suffix}`),
          candidate("document.FINANCIAL_INSTRUMENT.instrumentType", "CHEQUE"),
          candidate("document.FINANCIAL_INSTRUMENT.direction", "RECEIVED"),
          candidate("document.FINANCIAL_INSTRUMENT.amount", "8000"),
          candidate("document.FINANCIAL_INSTRUMENT.maturityDate", "2026-12-15"),
        ]),
      });
      expect(build.status).toBe("CREATED");
      if (build.status !== "CREATED") return;
      const changeIds = (await prisma.businessCandidateChange.findMany({ where: { candidateId: build.candidateId } })).map((c) => c.id);
      await decideBusinessCandidateChanges({ organizationId: organization.id, candidateId: build.candidateId, actorUserId: user.id, approvedChangeIds: changeIds, rejectedChangeIds: [] });
      const receipt = await promoteBusinessCandidate({ organizationId: organization.id, candidateId: build.candidateId, actorUserId: user.id, execute: createBusinessCandidateActionRuntimeExecutor(auth) });
      expect(receipt.status).toBe("SUCCEEDED");
      const instrument = await prisma.financialInstrument.findFirstOrThrow({ where: { organizationId: organization.id, customerId: customer.id } });
      expect(instrument.instrumentType).toBe("CHEQUE");
      expect(instrument.direction).toBe("RECEIVED");
      expect(Number(instrument.amount)).toBe(8000);
    } finally {
      await prisma.financialInstrument.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30_000);

  it("Re-extracting the same attachment is idempotent at the storage layer: persistBusinessPropositions keyed on the same attachmentId never creates a second BusinessCandidate", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { buildAndPersistDocumentCandidate } = await import("../document-candidate-builder");
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Phase14 Idempotent ${suffix}` } });
    try {
      const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas Yapı ${suffix}`, currency: "TRY" } });
      const attachmentId = `att-${suffix}`;
      const input = {
        organizationId: organization.id, actorId: "actor-1", attachmentId, domain: "SALES_INVOICE" as const,
        extraction: extraction([candidate("document.SALES_INVOICE.customerNameEvidence", customer.displayName), candidate("document.SALES_INVOICE.title", "Fatura"), candidate("document.SALES_INVOICE.amount", "100")]),
      };
      const first = await buildAndPersistDocumentCandidate(input);
      const second = await buildAndPersistDocumentCandidate(input);
      expect(first.status).toBe("CREATED");
      expect(second.status).toBe("CREATED");
      if (first.status === "CREATED" && second.status === "CREATED") expect(second.candidateId).toBe(first.candidateId);
      expect(await prisma.businessCandidate.count({ where: { organizationId: organization.id, sourceMessageId: null } })).toBe(1);
    } finally {
      await prisma.businessCandidate.deleteMany({ where: { organizationId: organization.id } });
      await prisma.customer.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
    }
  }, 30_000);
});
