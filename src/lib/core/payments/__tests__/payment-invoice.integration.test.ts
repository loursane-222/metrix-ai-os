import { describe, expect, it } from "vitest";

const databaseUrl = process.env.PAYMENT_INVOICE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("Payment ↔ Invoice integration", () => {
  it("marks a linked invoice paid only after all linked payments cover its total", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { createNewPayment, applyPaymentAmount }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/payments/payment.service"),
    ]);
    const organization = await prisma.organization.create({ data: { name: `Payment invoice integration ${Date.now()}` } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Payment invoice integration customer" } });
    try {
      const financialAccount = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });
      const invoice = await prisma.invoice.create({ data: { organizationId: organization.id, customerId: customer.id, invoiceNumber: `INTEGRATION-${Date.now()}`, title: "Linked invoice", amount: 1000, taxRate: 20, taxAmount: 200, totalAmount: 1200, currency: "TRY", status: "SENT" } });
      const linkedPayment = await createNewPayment({ organizationId: organization.id, customerId: customer.id, invoiceId: invoice.id, title: "Linked payment", amount: 1200 });
      await applyPaymentAmount({ organizationId: organization.id, paymentId: linkedPayment.payment.id, amount: 600, paymentMethod: "CASH", financialAccountReference: financialAccount.id, actorId: "test-actor" });
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("SENT");
      await applyPaymentAmount({ organizationId: organization.id, paymentId: linkedPayment.payment.id, amount: 600, paymentMethod: "CASH", financialAccountReference: financialAccount.id, actorId: "test-actor" });
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");

      const legacy = await createNewPayment({ organizationId: organization.id, customerId: customer.id, title: "Legacy payment", amount: 50 });
      await applyPaymentAmount({ organizationId: organization.id, paymentId: legacy.payment.id, amount: 50, paymentMethod: "CASH", financialAccountReference: financialAccount.id, actorId: "test-actor" });
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: legacy.payment.id } })).invoiceId).toBeNull();
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
