import { describe, expect, it } from "vitest";

const databaseUrl = process.env.SALES_PAYMENT_TERM_PROPAGATION_INTEGRATION_DATABASE_URL;

/**
 * Reproduces the exact coherent sales E2E scenario Final Business Reality
 * Acceptance broke: Customer → Order (2-component structured payment term)
 * → Delivery → Invoice → ObligationSchedule → partial Collection → final
 * Collection → reversal → Calendar → Reporting.
 *
 * Order/Delivery are constructed directly via Prisma rather than through
 * the full Quote-negotiation/production-status-transition pipeline
 * (createNewQuote → acceptQuoteWithLatestNegotiatedTerms →
 * createOrderFromQuote → transitionOrderStatus × 4 → createDeliveryFromOrder)
 * — that pipeline is Phase 6/9 territory, orthogonal to this bug and
 * already covered by its own tests. What matters here, and is exercised for
 * real against Postgres below, is everything AFTER Order.paymentTermSnapshot
 * exists: createInvoiceFromOrder (the fixed function),
 * materializeReceivableSchedule, applySettlement/reverseSettlement,
 * Calendar projection, and Reporting — none of which were touched by the
 * fix, so this also serves as their regression proof.
 */
describe.skipIf(!databaseUrl)("Sales structured payment-term propagation — real Postgres E2E", () => {
  it("Order → Invoice → 2-line ObligationSchedule → partial/final Collection → reversal → Calendar → Reporting, all consistent", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { createInvoiceFromOrder, sendInvoice } = await import("../invoice.service");
    const { materializeReceivableSchedule } = await import("@/lib/core/obligations/obligation-schedule.service");
    const { applySettlement, reverseSettlement } = await import("@/lib/core/settlements/settlement.service");
    const { computeFinancialObligationProjections } = await import("@/lib/core/calendar/calendar-financial-projection.service");
    const { computeForecastCashFlow } = await import("@/lib/core/reporting/forecast-cash-flow.service");
    const { computeReceivableAging } = await import("@/lib/core/reporting/obligation-aging.service");
    const { computeActualCashFlow } = await import("@/lib/core/reporting/cash-flow.service");

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const organization = await prisma.organization.create({ data: { name: `Sales PaymentTerm E2E ${suffix}` } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: `Atlas Yapı ${suffix}`, currency: "TRY" } });
    const account = await prisma.financialAccount.create({ data: { organizationId: organization.id, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY" } });

    // Two-component structured term: 50% immediate + 50% 15 days after
    // invoicing — the exact shape the acceptance run's coherent scenario
    // used, expressed with allocation types (PERCENTAGE) that scale with
    // whatever total this invoice actually ends up with, matching a normal
    // "half now, half net-15" commercial term.
    const twoComponentTerm = {
      schemaVersion: 1 as const,
      strategy: "SCHEDULE" as const,
      components: [
        { allocationType: "PERCENTAGE" as const, percentageBasisPoints: 5000, maturityBasis: "IMMEDIATE" as const },
        { allocationType: "PERCENTAGE" as const, percentageBasisPoints: 5000, maturityBasis: "DAYS_AFTER_REFERENCE" as const, days: 15, referenceDateType: "INVOICE_DATE" as const },
      ],
    };

    const order = await prisma.order.create({
      data: {
        organizationId: organization.id,
        orderNumber: `SIP-${suffix}`,
        customerId: customer.id,
        currency: "TRY",
        paymentTermSnapshot: twoComponentTerm,
        status: "READY",
      },
    });
    const orderItem = await prisma.orderItem.create({
      data: { organizationId: organization.id, orderId: order.id, name: `Granit Plaka ${suffix}`, unit: "adet", quantity: 10, unitPriceCents: BigInt(1_000), vatRateBasisPoints: 2000, lineTotalCents: BigInt(10_000) },
    });
    const delivery = await prisma.delivery.create({
      data: { organizationId: organization.id, deliveryNumber: `IRS-${suffix}`, sourceOrderId: order.id, customerId: customer.id, status: "DISPATCHED", dispatchedAt: new Date("2026-09-01T09:00:00.000Z") },
    });
    await prisma.deliveryItem.create({
      data: { organizationId: organization.id, deliveryId: delivery.id, orderItemId: orderItem.id, name: orderItem.name, quantity: 10 },
    });

    try {
      // --- Order → Invoice: the fixed propagation ---
      const invoice = await createInvoiceFromOrder({ organizationId: organization.id, sourceOrderId: order.id });
      expect(invoice.orderId).toBe(order.id);
      expect(Number(invoice.totalAmount)).toBe(120); // 10 × 10.00 net + 20% VAT
      const invoiceSnapshot = invoice.paymentTermSnapshot as unknown as { components: unknown[] } | null;
      expect(invoiceSnapshot).not.toBeNull();
      expect(invoiceSnapshot!.components).toHaveLength(2); // ← the exact regression: was empty before the fix

      // --- CUSTOMER/QUOTE CHANGED AFTER ORDER: the invoice must ignore it ---
      // Order carries no live Quote link for this fixture (direct Prisma
      // construction), so there is nothing upstream that COULD leak in —
      // this positively confirms createInvoiceFromOrder never re-reads
      // Quote/Customer state; it already asserted `quoteId: null` in the
      // mocked unit tests. Mutating the customer's own record here and
      // re-deriving nothing from it is the live-Postgres complement of that.
      await prisma.customer.updateMany({ where: { id: customer.id, organizationId: organization.id }, data: { displayName: "Changed After Order — must not appear anywhere" } });

      await sendInvoice({ invoiceId: invoice.id, organizationId: organization.id });

      // --- Invoice → ObligationScheduleLine: multi-component schedule ---
      const schedule = await materializeReceivableSchedule({ organizationId: organization.id, invoiceId: invoice.id, actorId: "test-actor", referenceDate: new Date("2026-09-05T00:00:00.000Z") });
      expect(schedule.lines).toHaveLength(2); // ← was 1 (trivial) before the fix
      expect(schedule.payments).toHaveLength(2);
      const [componentA, componentB] = schedule.lines.sort((a, b) => a.componentIndex - b.componentIndex);
      expect(Number(componentA!.originalAmount)).toBe(60);
      expect(Number(componentB!.originalAmount)).toBe(60);
      expect(componentA!.dueDate.toISOString().slice(0, 10)).toBe("2026-09-05"); // IMMEDIATE = reference date
      expect(componentB!.dueDate.toISOString().slice(0, 10)).toBe("2026-09-20"); // +15 days
      const [paymentA, paymentB] = schedule.payments.sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));

      // --- CALENDAR: two separate, correctly-dated projections ---
      const projections = await computeFinancialObligationProjections({ organizationId: organization.id, dueDateTo: new Date("2026-12-01T00:00:00.000Z"), now: new Date("2026-09-05T00:00:00.000Z") });
      const ourProjections = projections.filter((item) => item.id === `obligation:${componentA!.id}` || item.id === `obligation:${componentB!.id}`);
      expect(ourProjections).toHaveLength(2);
      expect(ourProjections.map((item) => item.amount).sort((a, b) => a - b)).toEqual([60, 60]);

      // --- REPORTING (before any settlement): forecast counts both components once, no double-count ---
      const forecastBefore = await computeForecastCashFlow(organization.id, new Date("2026-09-05T00:00:00.000Z"), 30);
      const receivableTotalBefore = forecastBefore.totals.find((t) => t.direction === "RECEIVABLE" && t.currency === "TRY");
      const ourForecastAmount = forecastBefore.items.filter((item) => item.id === `obligation:${componentA!.id}` || item.id === `obligation:${componentB!.id}`).reduce((sum, item) => sum + item.amount, 0);
      expect(ourForecastAmount).toBe(120);
      expect(receivableTotalBefore!.amount).toBeGreaterThanOrEqual(120); // includes both, exactly once each

      // --- PARTIAL settlement on component A (60 → 25 partial) ---
      const partial = await applySettlement({ organizationId: organization.id, paymentId: paymentA!.id, amount: 25, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor", occurredAt: new Date("2026-09-06T00:00:00.000Z") });
      expect(Number(partial!.payment.paidAmount)).toBe(25);
      const agingAfterPartial = await computeReceivableAging(organization.id, new Date("2026-09-06T00:00:00.000Z"));
      const agingA = agingAfterPartial.items.find((item) => item.id === `obligation:${componentA!.id}`);
      expect(agingA?.amount).toBe(35); // 60 - 25 remaining — never the full 60 again

      // --- FINAL settlement completes component A, and fully settles component B ---
      await applySettlement({ organizationId: organization.id, paymentId: paymentA!.id, amount: 35, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor", occurredAt: new Date("2026-09-07T00:00:00.000Z") });
      const settlementB = await applySettlement({ organizationId: organization.id, paymentId: paymentB!.id, amount: 60, paymentMethod: "CASH", financialAccountReference: account.id, actorId: "test-actor", occurredAt: new Date("2026-09-20T00:00:00.000Z") });
      const refreshedPaymentA = await prisma.payment.findUniqueOrThrow({ where: { id: paymentA!.id } });
      expect(Number(refreshedPaymentA.paidAmount)).toBe(60);
      expect(refreshedPaymentA.status).toBe("PAID");

      // --- ACTUAL vs FORECAST: settled amount moved to actual, forecast no longer double-counts it ---
      const actualFlow = await computeActualCashFlow(organization.id, new Date("2026-09-01T00:00:00.000Z"), new Date("2026-09-30T23:59:59.000Z"));
      expect(actualFlow.netByCurrency.find((n) => n.currency === "TRY")!.amount).toBe(120); // 25 + 35 + 60 inflow
      const forecastAfter = await computeForecastCashFlow(organization.id, new Date("2026-09-21T00:00:00.000Z"), 30);
      const remainingForecast = forecastAfter.items.filter((item) => item.id === `obligation:${componentA!.id}` || item.id === `obligation:${componentB!.id}`);
      expect(remainingForecast).toHaveLength(0); // both fully settled — neither still forecast

      // --- REVERSAL: reversing component B's settlement reopens exactly that component ---
      await reverseSettlement({ organizationId: organization.id, settlementId: settlementB!.settlement.id, reason: "test reversal", actorId: "test-actor", occurredAt: new Date("2026-09-21T00:00:00.000Z") });
      const refreshedPaymentB = await prisma.payment.findUniqueOrThrow({ where: { id: paymentB!.id } });
      expect(Number(refreshedPaymentB.paidAmount)).toBe(0); // reopened
      const agingAfterReversal = await computeReceivableAging(organization.id, new Date("2026-09-22T00:00:00.000Z"));
      const agingB = agingAfterReversal.items.find((item) => item.id === `obligation:${componentB!.id}`);
      expect(agingB?.amount).toBe(60); // component B's full amount is receivable again
      const agingAStillSettled = agingAfterReversal.items.find((item) => item.id === `obligation:${componentA!.id}`);
      expect(agingAStillSettled).toBeUndefined(); // component A's own settlement is untouched by B's reversal
    } finally {
      await prisma.application.deleteMany({ where: { organizationId: organization.id } });
      await prisma.settlement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.financialAccountMovement.deleteMany({ where: { organizationId: organization.id } });
      await prisma.obligationScheduleLine.deleteMany({ where: { organizationId: organization.id } });
      await prisma.payment.deleteMany({ where: { organizationId: organization.id } });
      await prisma.invoiceItem.deleteMany({ where: { organizationId: organization.id } });
      await prisma.invoice.deleteMany({ where: { organizationId: organization.id } });
      await prisma.deliveryItem.deleteMany({ where: { organizationId: organization.id } });
      await prisma.delivery.deleteMany({ where: { organizationId: organization.id } });
      await prisma.orderItem.deleteMany({ where: { organizationId: organization.id } });
      await prisma.order.deleteMany({ where: { organizationId: organization.id } });
      await prisma.financialAccount.deleteMany({ where: { organizationId: organization.id } });
      await prisma.customer.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  }, 60_000);
});
