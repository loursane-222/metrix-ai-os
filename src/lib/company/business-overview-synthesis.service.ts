import { prisma } from "@/lib/core/shared/prisma";
import { getAccountingSummary, type AccountingMetric } from "@/lib/accounting/accounting-summary";
import { buildExpenseContextForOrganization, buildExpenseIntelligence } from "@/lib/core/expenses";
import { buildPaymentContextForOrganization } from "@/lib/core/payments/payment-context-builder";
import { buildPaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import { buildFinancialHealthIntelligence } from "@/lib/financial-health-intelligence";
import type { FinancialHealthLevel } from "@/lib/financial-health-intelligence/financial-health-intelligence.types";
import { buildCollectionsDataset } from "@/lib/artifacts/datasets/collections-dataset.service";
import { buildCollectionsManagementSummary } from "@/lib/artifacts/datasets/collections-management-summary.service";

export type BusinessOverviewSignal = Readonly<{
  code: string;
  domain: "finance" | "goals" | "production" | "suppliers" | "orders" | "deliveries";
  severity: FinancialHealthLevel;
  title: string;
  detail: string;
}>;

export type BusinessOverviewGoalProgress = Readonly<{
  goalId: string;
  title: string;
  metric: "REVENUE" | "COLLECTION" | "SELF_REPORTED";
  targetAmount: number | null;
  actualAmount: number | null;
  currency: string;
  progressRatio: number | null;
  status: "ON_TRACK" | "AT_RISK" | "BEHIND" | "UNKNOWN";
}>;

export type BusinessOverviewCapacity = Readonly<{
  activeProductionOrderCount: number;
  totalPlanned: number;
  totalProduced: number;
  utilizationRatio: number | null;
  lateOrderCount: number;
}>;

export type BusinessOverviewFinancialSummary = Readonly<{
  cashPosition: AccountingMetric;
  monthlyRevenue: AccountingMetric;
  monthlyExpense: AccountingMetric;
  totalReceivable: AccountingMetric;
  totalPayable: AccountingMetric;
}>;

export type BusinessOverview = Readonly<{
  generatedAt: string;
  financialSummary: BusinessOverviewFinancialSummary;
  financialHealthLevel: FinancialHealthLevel;
  financialExecutiveSummary: string;
  goals: readonly BusinessOverviewGoalProgress[];
  capacity: BusinessOverviewCapacity;
  activeRisks: readonly BusinessOverviewSignal[];
  activeOpportunities: readonly BusinessOverviewSignal[];
}>;

// Reuses the same finance composition as /api/finance/summary (route.ts) —
// the org's single real financial-health computation — rather than
// introducing a second one. Goal/capacity progress are new, narrowly scoped
// live calculations against canonical Invoice/Settlement/ProductionOrder
// truth; nothing here duplicates a value another domain already
// owns and computes.
export async function buildBusinessOverview(organizationId: string): Promise<BusinessOverview> {
  const now = new Date();
  const [accountingSummary, expenseContext, paymentContext, activeGoals, capacity, supplierRisk, ordersOnHold, failedDeliveries] = await Promise.all([
    getAccountingSummary(organizationId, now),
    buildExpenseContextForOrganization(organizationId),
    buildPaymentContextForOrganization(organizationId),
    prisma.salesGoal.findMany({ where: { organizationId, status: "ACTIVE" } }),
    computeCapacity(organizationId, now),
    computeSupplierDependencyRiskCount(organizationId),
    prisma.order.count({ where: { organizationId, status: "ON_HOLD" } }),
    prisma.delivery.count({ where: { organizationId, status: "FAILED_DELIVERY" } }),
  ]);
  const expenseIntelligence = buildExpenseIntelligence(expenseContext);
  const paymentIntelligence = buildPaymentIntelligence(paymentContext);
  const financialHealthIntelligence = buildFinancialHealthIntelligence({ expenseContext, expenseIntelligence, paymentContext, paymentIntelligence });

  const goals = await Promise.all(activeGoals.map((goal) => computeGoalProgress(organizationId, goal, now)));

  const activeRisks: BusinessOverviewSignal[] = [
    ...financialHealthIntelligence.riskWarnings.map((detail, index) => ({
      code: `FINANCE_RISK_${index}`,
      domain: "finance" as const,
      severity: financialHealthIntelligence.financialHealthLevel,
      title: "Finansal risk",
      detail,
    })),
    ...goals
      .filter((goal) => goal.status === "BEHIND")
      .map((goal) => ({
        code: `GOAL_BEHIND_${goal.goalId}`,
        domain: "goals" as const,
        severity: "MEDIUM" as const,
        title: `${goal.title} hedefi geride`,
        detail: goal.progressRatio !== null
          ? `Beklenen ilerlemenin gerisinde — gerçekleşme oranı %${Math.round(goal.progressRatio * 100)}.`
          : "Hedefe karşı ilerleme hesaplanamadı.",
      })),
    ...(capacity.lateOrderCount > 0
      ? [{
          code: "PRODUCTION_LATE",
          domain: "production" as const,
          severity: capacity.lateOrderCount >= 3 ? ("HIGH" as const) : ("MEDIUM" as const),
          title: "Üretimde gecikme",
          detail: `${capacity.lateOrderCount} üretim emri planlanan bitiş tarihini geçti.`,
        }]
      : []),
    ...(supplierRisk > 0
      ? [{
          code: "SUPPLIER_DEPENDENCY_RISK",
          domain: "suppliers" as const,
          severity: supplierRisk >= 3 ? ("HIGH" as const) : ("MEDIUM" as const),
          title: "Tedarikçi bağımlılık riski",
          detail: `${supplierRisk} tedarikçi, tek kaynaklı bağımlılık riski taşıyor olarak işaretli.`,
        }]
      : []),
    ...(ordersOnHold > 0
      ? [{
          code: "ORDERS_ON_HOLD",
          domain: "orders" as const,
          severity: ordersOnHold >= 3 ? ("HIGH" as const) : ("MEDIUM" as const),
          title: "Beklemede kalan siparişler",
          detail: `${ordersOnHold} sipariş beklemede (ON_HOLD) durumunda.`,
        }]
      : []),
    ...(failedDeliveries > 0
      ? [{
          code: "DELIVERIES_FAILED",
          domain: "deliveries" as const,
          severity: failedDeliveries >= 3 ? ("HIGH" as const) : ("MEDIUM" as const),
          title: "Başarısız teslimat",
          detail: `${failedDeliveries} teslimat başarısız oldu, henüz yeniden planlanmadı.`,
        }]
      : []),
  ];

  const activeOpportunities: BusinessOverviewSignal[] = [
    ...goals
      .filter((goal) => goal.status === "ON_TRACK" && goal.progressRatio !== null && goal.progressRatio >= 1.1)
      .map((goal) => ({
        code: `GOAL_AHEAD_${goal.goalId}`,
        domain: "goals" as const,
        severity: "LOW" as const,
        title: `${goal.title} hedefi önde`,
        detail: `Gerçekleşme oranı %${Math.round((goal.progressRatio ?? 0) * 100)} — hedefin üzerinde.`,
      })),
    ...(financialHealthIntelligence.cashPerformanceLevel === "STRONG"
      ? [{
          code: "CASH_STRONG",
          domain: "finance" as const,
          severity: "LOW" as const,
          title: "Nakit tahsilatı güçlü",
          detail: financialHealthIntelligence.executiveSummary,
        }]
      : []),
  ];

  return {
    generatedAt: now.toISOString(),
    financialSummary: {
      cashPosition: accountingSummary.metrics.cashPosition,
      monthlyRevenue: accountingSummary.metrics.monthlyRevenue,
      monthlyExpense: accountingSummary.metrics.monthlyExpense,
      totalReceivable: accountingSummary.metrics.totalReceivable,
      totalPayable: accountingSummary.metrics.totalPayable,
    },
    financialHealthLevel: financialHealthIntelligence.financialHealthLevel,
    financialExecutiveSummary: financialHealthIntelligence.executiveSummary,
    goals,
    capacity,
    activeRisks,
    activeOpportunities,
  };
}

type SalesGoalRow = Awaited<ReturnType<typeof prisma.salesGoal.findMany>>[number];

async function computeGoalProgress(organizationId: string, goal: SalesGoalRow, now: Date): Promise<BusinessOverviewGoalProgress> {
  const periodStart = goal.startsAt ?? new Date(0);
  const periodEnd = goal.endsAt ?? now;

  if (goal.targetRevenueCents !== null) {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId, status: { in: ["SENT", "PAID"] }, createdAt: { gte: periodStart, lte: periodEnd } },
      select: { totalAmount: true },
    });
    const actualAmount = invoices.reduce((sum, row) => sum + Number(row.totalAmount), 0);
    const targetAmount = Number(goal.targetRevenueCents) / 100;
    const progressRatio = targetAmount > 0 ? actualAmount / targetAmount : null;
    return {
      goalId: goal.id, title: goal.title, metric: "REVENUE", targetAmount, actualAmount, currency: goal.currency,
      progressRatio, status: computeGoalStatus(progressRatio, goal.startsAt, goal.endsAt, now),
    };
  }

  if (goal.targetCollectionCents !== null) {
    const dataset = await buildCollectionsDataset(organizationId, {
      from: periodStart,
      to: periodEnd,
      label: goal.title,
      isoLabel: `goal-${goal.id}`,
    });
    const summary = buildCollectionsManagementSummary(dataset);
    // A goal is denominated in exactly one currency. Other currencies remain
    // visible in the canonical summary but are never silently blended into it.
    const actualAmount = summary.currencies.find((item) => item.currency === goal.currency)?.netCollections ?? 0;
    const targetAmount = Number(goal.targetCollectionCents) / 100;
    const progressRatio = targetAmount > 0 ? actualAmount / targetAmount : null;
    return {
      goalId: goal.id, title: goal.title, metric: "COLLECTION", targetAmount, actualAmount, currency: goal.currency,
      progressRatio, status: computeGoalStatus(progressRatio, goal.startsAt, goal.endsAt, now),
    };
  }

  // No revenue/collection target — this goal tracks a self-reported metric
  // (e.g. a custom goalType) with no canonical source to recompute it
  // against; report the stored values honestly rather than inventing a
  // computation.
  const targetAmount = goal.targetValue !== null ? Number(goal.targetValue) : null;
  const actualAmount = goal.actualValue !== null ? Number(goal.actualValue) : null;
  const progressRatio = targetAmount !== null && targetAmount > 0 && actualAmount !== null ? actualAmount / targetAmount : null;
  return {
    goalId: goal.id, title: goal.title, metric: "SELF_REPORTED", targetAmount, actualAmount, currency: goal.currency,
    progressRatio, status: progressRatio === null ? "UNKNOWN" : computeGoalStatus(progressRatio, goal.startsAt, goal.endsAt, now),
  };
}

function computeGoalStatus(
  progressRatio: number | null,
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date,
): BusinessOverviewGoalProgress["status"] {
  if (progressRatio === null) return "UNKNOWN";
  if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) {
    if (progressRatio >= 1) return "ON_TRACK";
    if (progressRatio >= 0.7) return "AT_RISK";
    return "BEHIND";
  }
  const totalMs = endsAt.getTime() - startsAt.getTime();
  const elapsedMs = Math.min(Math.max(now.getTime() - startsAt.getTime(), 0), totalMs);
  const expectedRatio = elapsedMs / totalMs;
  if (expectedRatio <= 0) return "ON_TRACK";
  if (progressRatio >= expectedRatio) return "ON_TRACK";
  if (progressRatio >= expectedRatio * 0.7) return "AT_RISK";
  return "BEHIND";
}

// Reads the dependency-risk flag computeSupplierDependencyRisk (supplier-
// intelligence.service.ts) already computes and persists onto
// Supplier.riskProfile — this only reads it, it does not recompute
// dependency risk itself.
async function computeSupplierDependencyRiskCount(organizationId: string): Promise<number> {
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { riskProfile: true },
  });
  return suppliers.filter((supplier) => {
    const riskProfile = supplier.riskProfile;
    return typeof riskProfile === "object" && riskProfile !== null && !Array.isArray(riskProfile)
      && (riskProfile as Record<string, unknown>).dependencyRiskFlag === true;
  }).length;
}

export async function computeCapacity(organizationId: string, now: Date): Promise<BusinessOverviewCapacity> {
  const orders = await prisma.productionOrder.findMany({
    where: { organizationId, status: { in: ["RELEASED", "IN_PROGRESS", "COMPLETED"] } },
    select: { quantityPlanned: true, quantityProduced: true, plannedEndAt: true, actualEndAt: true, status: true },
  });
  const totalPlanned = orders.reduce((sum, row) => sum + Number(row.quantityPlanned), 0);
  const totalProduced = orders.reduce((sum, row) => sum + Number(row.quantityProduced), 0);
  const lateOrderCount = orders.filter((row) => {
    if (!row.plannedEndAt) return false;
    if (row.actualEndAt) return row.actualEndAt > row.plannedEndAt;
    return row.status !== "COMPLETED" && row.plannedEndAt < now;
  }).length;
  return {
    activeProductionOrderCount: orders.filter((row) => row.status === "IN_PROGRESS" || row.status === "RELEASED").length,
    totalPlanned,
    totalProduced,
    utilizationRatio: totalPlanned > 0 ? totalProduced / totalPlanned : null,
    lateOrderCount,
  };
}
