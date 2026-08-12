import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION === "1"
  ? describe
  : describe.skip;

databaseIntegration("buildExecutiveOperatingContext companyPerformanceSignal reconnection (real PostgreSQL)", () => {
  it("returns real companyPerformanceSignal/executiveForecast/goalIntelligence/customerHealthIntelligence built from real Quote/Payment/Expense/SalesGoal data", async () => {
    const { prisma } = await import("@/lib/core/shared/prisma");
    const { buildExecutiveOperatingContext } = await import("../executive-operating-context-builder.service");
    const suffix = randomUUID();

    const organization = await prisma.organization.create({
      data: { name: `CPS Reconnection Acceptance ${suffix}` },
    });

    try {
      const customer = await prisma.customer.create({
        data: { organizationId: organization.id, displayName: `CPS Acceptance Customer ${suffix}` },
      });

      const now = new Date();

      await prisma.quote.create({
        data: {
          organizationId: organization.id,
          customerId: customer.id,
          customerName: customer.displayName,
          title: "CPS Acceptance Won Quote",
          amount: 50_000,
          status: "WON",
          wonAt: now,
        },
      });

      await prisma.payment.create({
        data: {
          organizationId: organization.id,
          customerId: customer.id,
          title: "CPS Acceptance Payment",
          amount: 50_000,
          paidAmount: 50_000,
          status: "PAID",
          paidAt: now,
        },
      });

      await prisma.expense.create({
        data: {
          organizationId: organization.id,
          title: "CPS Acceptance Expense",
          category: "RENT",
          amount: 10_000,
          expenseDate: now,
          status: "PAID",
        },
      });

      await prisma.salesGoal.create({
        data: {
          organizationId: organization.id,
          title: "CPS Acceptance Monthly Goal",
          period: "MONTHLY",
          targetRevenueCents: BigInt(10_000_000),
          status: "ACTIVE",
        },
      });

      const result = await buildExecutiveOperatingContext({
        organizationId: organization.id,
        organizationMembershipRole: "OWNER",
        mode: "CHAT",
      });

      expect(result.executiveForecast).not.toBeNull();
      expect(result.goalIntelligence).not.toBeNull();
      expect(result.customerHealthIntelligence).not.toBeNull();

      expect(result.companyPerformanceSignal).not.toBeNull();
      expect(result.companyPerformanceSignal).toMatchObject({
        componentScores: expect.any(Object),
        performanceLevel: expect.stringMatching(/^(STRONG|STABLE|PRESSURED|CRITICAL)$/),
        confidence: expect.stringMatching(/^(LOW|MEDIUM|HIGH)$/),
      });
      // Faz A'nın öncesinde bu alan sabit null idi; artık gerçek veriden
      // türeyen, en az bir dolu bileşen skoru üreten bir nesne dönmeli.
      const componentScores = result.companyPerformanceSignal!.componentScores;
      const populatedComponents = Object.values(componentScores).filter((score) => score !== null);
      expect(populatedComponents.length).toBeGreaterThan(0);
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
