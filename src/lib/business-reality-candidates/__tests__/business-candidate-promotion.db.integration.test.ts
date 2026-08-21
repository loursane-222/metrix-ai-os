import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === "1"
  ? describe
  : describe.skip;

databaseIntegration("Business Candidate canonical promotion (real PostgreSQL)", () => {
  it("promotes partial customer terms, product and task through the real Action Runtime", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const {
      createBusinessCandidateActionRuntimeExecutor,
      decideBusinessCandidateChanges,
      getBusinessCandidate,
      persistBusinessPropositions,
      promoteBusinessCandidate,
    } = await import("..");
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { phone: `+90555${suffix.replaceAll("-", "").slice(0, 10)}` },
    });
    const organization = await prisma.organization.create({
      data: { name: `ACCEPTANCE Business Reality ${suffix}` },
    });
    const membership = await prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
    });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: `acceptance:${suffix}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const customer = await prisma.customer.create({
      data: {
        organizationId: organization.id,
        displayName: `Atlas Acceptance ${suffix}`,
        currency: "TRY",
      },
    });
    await prisma.customerCommercialTerms.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        paymentTermDays: 30,
        defaultCurrency: "TRY",
      },
    });
    const auth = { user, organization, membership, session };

    try {
      const candidates = await persistBusinessPropositions({
        organizationId: organization.id,
        sourceChannel: "TEXT",
        sourceInputId: `input:${suffix}`,
        propositions: [
          {
            propositionId: `terms:${suffix}`,
            propositionType: "COMMERCIAL_TERMS_UPDATE",
            targetDomain: "CustomerCommercialTerms",
            targetRecordId: customer.id,
            entityResolutionStatus: "RESOLVED",
            operation: "UPDATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: {
              producer: "db-integration",
              targetVersion: customer.updatedAt.toISOString(),
            },
            changes: [
              {
                fieldPath: "commercialTerms.defaultCurrency",
                previousValue: "TRY",
                proposedValue: "EUR",
              },
              {
                fieldPath: "commercialTerms.paymentTermDays",
                previousValue: 30,
                proposedValue: 45,
              },
            ],
          },
          {
            propositionId: `product:${suffix}`,
            propositionType: "PRODUCT_CREATE",
            targetDomain: "ProductService",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration" },
            changes: [
              { fieldPath: "name", proposedValue: `Granit X ${suffix}` },
              { fieldPath: "type", proposedValue: "PRODUCT" },
            ],
          },
          {
            propositionId: `customer:${suffix}`,
            propositionType: "customer_spreadsheet_import",
            targetDomain: "Customer",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", source: "spreadsheet_import" },
            changes: [
              { fieldPath: "displayName", proposedValue: `Import Acceptance ${suffix}` },
              { fieldPath: "taxNumber", proposedValue: `TX${suffix.replaceAll("-", "").slice(0, 8)}` },
            ],
          },
          {
            propositionId: `invoice:${suffix}`,
            propositionType: "invoice_spreadsheet_import",
            targetDomain: "Invoice",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", source: "spreadsheet_import" },
            changes: [
              { fieldPath: "customerId", proposedValue: customer.id },
              { fieldPath: "title", proposedValue: `Danışmanlık ${suffix}` },
              { fieldPath: "amount", proposedValue: "1000" },
              { fieldPath: "invoiceNumber", proposedValue: `EXT-${suffix}` },
            ],
          },
          {
            propositionId: `supplier:${suffix}`,
            propositionType: "supplier_spreadsheet_import",
            targetDomain: "Supplier",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", source: "spreadsheet_import" },
            changes: [
              { fieldPath: "displayName", proposedValue: `Demir Metal ${suffix}` },
              { fieldPath: "taxNumber", proposedValue: `TX-SUP-${suffix.replaceAll("-", "").slice(0, 8)}` },
            ],
          },
          {
            propositionId: `payment:${suffix}`,
            propositionType: "payment_spreadsheet_import",
            targetDomain: "Payment",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", source: "spreadsheet_import" },
            changes: [
              { fieldPath: "customerId", proposedValue: customer.id },
              { fieldPath: "title", proposedValue: `Ocak tahsilatı ${suffix}` },
              { fieldPath: "amount", proposedValue: "750" },
            ],
          },
          {
            propositionId: `offer:${suffix}`,
            propositionType: "offer_spreadsheet_import",
            targetDomain: "Quote",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", source: "spreadsheet_import" },
            changes: [
              { fieldPath: "customerId", proposedValue: customer.id },
              { fieldPath: "title", proposedValue: `Granit teklifi ${suffix}` },
              { fieldPath: "amount", proposedValue: "2500" },
            ],
          },
          {
            propositionId: `order:${suffix}`,
            propositionType: "order_spreadsheet_import",
            targetDomain: "Order",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", source: "spreadsheet_import" },
            changes: [
              { fieldPath: "customerId", proposedValue: customer.id },
              { fieldPath: "notes", proposedValue: `Acil sipariş ${suffix}` },
            ],
          },
          {
            propositionId: `customer_merge:${suffix}`,
            propositionType: "customer_spreadsheet_import",
            targetDomain: "Customer",
            targetRecordId: customer.id,
            entityResolutionStatus: "RESOLVED",
            operation: "UPDATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", source: "spreadsheet_import" },
            changes: [
              { fieldPath: "phone", proposedValue: "5551234567" },
              { fieldPath: "billingAddress", proposedValue: { line1: `Kadıköy ${suffix}` } },
            ],
          },
          {
            propositionId: `task:${suffix}`,
            propositionType: "TASK_CREATE",
            targetDomain: "ExecutiveAction",
            entityResolutionStatus: "NEW_ENTITY",
            operation: "CREATE",
            confidence: 0.99,
            requiresApproval: true,
            verificationRequired: false,
            provenance: { producer: "db-integration", ownerResolution: "UNRESOLVED" },
            changes: [
              { fieldPath: "title", proposedValue: "Ahmet'i ara" },
              { fieldPath: "ownerType", proposedValue: "UNASSIGNED" },
              {
                fieldPath: "dueDate",
                proposedValue: new Date(Date.now() + 86_400_000).toISOString(),
              },
            ],
          },
        ],
      });
      const [termsCandidate, productCandidate, customerCandidate, invoiceCandidate, supplierCandidate, paymentCandidate, offerCandidate, orderCandidate, customerMergeCandidate, taskCandidate] = candidates;
      const [currencyChange, termChange] = termsCandidate!.changes;
      const partial = await decideBusinessCandidateChanges({
        organizationId: organization.id,
        candidateId: termsCandidate!.id,
        actorUserId: user.id,
        approvedChangeIds: [currencyChange!.id],
        rejectedChangeIds: [termChange!.id],
      });
      expect(partial.status).toBe("PARTIALLY_APPROVED");
      const termsReceipt = await promoteBusinessCandidate({
        organizationId: organization.id,
        candidateId: termsCandidate!.id,
        actorUserId: user.id,
        execute: createBusinessCandidateActionRuntimeExecutor(auth),
      });
      expect(termsReceipt.status).toBe("SUCCEEDED");
      expect(termsReceipt.approvedChangeIds).toEqual([currencyChange!.id]);

      for (const candidate of [productCandidate!, customerCandidate!, invoiceCandidate!, supplierCandidate!, paymentCandidate!, offerCandidate!, orderCandidate!, customerMergeCandidate!, taskCandidate!]) {
        await decideBusinessCandidateChanges({
          organizationId: organization.id,
          candidateId: candidate.id,
          actorUserId: user.id,
          approvedChangeIds: candidate.changes.map((change) => change.id),
          rejectedChangeIds: [],
        });
        const receipt = await promoteBusinessCandidate({
          organizationId: organization.id,
          candidateId: candidate.id,
          actorUserId: user.id,
          execute: createBusinessCandidateActionRuntimeExecutor(auth),
        });
        expect(receipt.status).toBe("SUCCEEDED");
        expect(await promoteBusinessCandidate({
          organizationId: organization.id,
          candidateId: candidate.id,
          actorUserId: user.id,
          execute: createBusinessCandidateActionRuntimeExecutor(auth),
        })).toEqual(receipt);
      }

      const persistedTerms = await prisma.customerCommercialTerms.findUniqueOrThrow({
        where: { customerId: customer.id },
      });
      expect(persistedTerms.defaultCurrency).toBe("EUR");
      expect(persistedTerms.paymentTermDays).toBe(30);
      expect(await prisma.productService.count({
        where: { organizationId: organization.id, name: `Granit X ${suffix}` },
      })).toBe(1);
      expect(await prisma.customer.count({
        where: { organizationId: organization.id, displayName: `Import Acceptance ${suffix}` },
      })).toBe(1);
      const importedInvoice = await prisma.invoice.findFirstOrThrow({
        where: { organizationId: organization.id, customerId: customer.id, title: `Danışmanlık ${suffix}` },
      });
      expect(importedInvoice.invoiceNumber).toBe(`EXT-${suffix}`);
      expect(Number(importedInvoice.totalAmount)).toBe(1200);
      expect(await prisma.supplier.count({
        where: { organizationId: organization.id, displayName: `Demir Metal ${suffix}` },
      })).toBe(1);
      const importedPayment = await prisma.payment.findFirstOrThrow({
        where: { organizationId: organization.id, customerId: customer.id, title: `Ocak tahsilatı ${suffix}` },
      });
      expect(Number(importedPayment.amount)).toBe(750);
      expect(importedPayment.status).toBe("PENDING");
      const importedOffer = await prisma.quote.findFirstOrThrow({
        where: { organizationId: organization.id, customerId: customer.id, title: `Granit teklifi ${suffix}` },
      });
      expect(Number(importedOffer.amount)).toBe(2500);
      expect(importedOffer.status).toBe("DRAFT");
      const importedOrder = await prisma.order.findFirstOrThrow({
        where: { organizationId: organization.id, customerId: customer.id, notes: `Acil sipariş ${suffix}` },
      });
      expect(importedOrder.status).toBe("DRAFT");
      expect(importedOrder.orderNumber).toBeTruthy();
      const mergedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(mergedCustomer.phone).toBe("5551234567");
      expect(mergedCustomer.billingAddress).toEqual({ line1: `Kadıköy ${suffix}` });
      expect(mergedCustomer.displayName).toBe(`Atlas Acceptance ${suffix}`);
      expect(await prisma.executiveAction.count({
        where: {
          organizationId: organization.id,
          sourceId: taskCandidate!.id,
          title: "Ahmet'i ara",
        },
      })).toBe(1);
      expect(await getBusinessCandidate({
        organizationId: randomUUID(),
        candidateId: termsCandidate!.id,
      })).toBeNull();
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30_000);
});
