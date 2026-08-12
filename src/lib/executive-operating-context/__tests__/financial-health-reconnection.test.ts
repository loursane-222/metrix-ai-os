import { beforeEach, describe, expect, it, vi } from "vitest";

const expenseContext = vi.hoisted(() => vi.fn());
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/executive-brain/executive-brain-context-builder.service", () => ({ buildExecutiveBrainContext: vi.fn().mockResolvedValue({ domainEvidence: [], sourceReliability: [] }) }));
vi.mock("@/lib/core/expenses", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/core/expenses")>()), buildExpenseContextForOrganization: expenseContext }));
vi.mock("@/lib/core/notifications/notification.service", () => ({ listNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/core/goals/goal.service", () => ({ listSalesGoals: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/customer-health-intelligence/customer-health-intelligence-engine.service", () => ({
  buildCustomerHealthIntelligence: vi.fn().mockResolvedValue({
    profiles: [],
    distribution: { healthyCount: 0, watchCount: 0, atRiskCount: 0, criticalCount: 0 },
    criticalCustomers: [],
    atRiskCustomers: [],
    watchCustomers: [],
    topInsights: [],
    confidence: "LOW",
    generatedAt: new Date().toISOString(),
    version: "v1.2",
  }),
}));
vi.mock("@/lib/executive-forecasting/executive-forecasting-engine.service", () => ({
  buildExecutiveForecast: vi.fn().mockResolvedValue({
    organizationId: "org-1",
    generatedAt: new Date().toISOString(),
    horizon: "30D",
    overallRiskLevel: "LOW",
    overallConfidence: "LOW",
    signals: [],
    projection: {
      horizon: "30D",
      expectedCollection7d: 0,
      expectedCollection30d: 0,
      expectedRevenue30d: 0,
      bestCaseRevenue: 0,
      worstCaseRevenue: 0,
      projectedCashInflow: 0,
      confidence: "LOW",
      dataLimitations: [],
    },
    executiveSummary: "",
    dataQualityNote: "",
  }),
}));

import { buildExecutiveOperatingContext } from "../executive-operating-context-builder.service";

const empty = { totalExpenseAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0, totalOverdueAmount: 0, overdueCount: 0, pendingCount: 0, monthlyBurnRate: 0, categoryBreakdown: [], hasExpenseData: false, recentExpenses: [] };

describe("buildExecutiveOperatingContext financial health reconnection", () => {
  beforeEach(() => expenseContext.mockReset());
  it("returns expense and financial intelligence built from organization data", async () => {
    expenseContext.mockResolvedValue({ ...empty, totalExpenseAmount: 10_000, totalOverdueAmount: 4_000, overdueCount: 1, monthlyBurnRate: 10_000, hasExpenseData: true, categoryBreakdown: [{ category: "RENT", total: 10_000, count: 1 }], recentExpenses: [{ id: "expense-1", title: "Ofis kirası", category: "RENT", amount: 10_000, currency: "TRY", expenseDate: new Date(), recurrenceType: "MONTHLY", status: "OVERDUE", vendorName: "Kiraya Veren" }] });
    const result = await buildExecutiveOperatingContext({ organizationId: "org-with-finance", organizationMembershipRole: "OWNER", mode: "CHAT" });
    expect(expenseContext).toHaveBeenCalledWith("org-with-finance");
    expect(result.expenseContext).toMatchObject({ hasExpenseData: true, overdueCount: 1 });
    expect(result.expenseIntelligence).toMatchObject({ burnRiskLevel: "CRITICAL", confidence: "LOW" });
    expect(result.financialHealthIntelligence).toMatchObject({ financialHealthLevel: "CRITICAL", confidence: "LOW" });
  });
  it("returns the honest low-confidence empty state when the organization has no expenses", async () => {
    expenseContext.mockResolvedValue(empty);
    const result = await buildExecutiveOperatingContext({ organizationId: "org-without-expenses", organizationMembershipRole: "OWNER", mode: "CHAT" });
    expect(result.expenseContext).toMatchObject({ hasExpenseData: false, categoryBreakdown: [] });
    expect(result.expenseIntelligence).toMatchObject({ burnRiskLevel: "LOW", confidence: "LOW", riskWarnings: [] });
    expect(result.financialHealthIntelligence).toMatchObject({ confidence: "LOW", riskWarnings: [] });
  });
});
