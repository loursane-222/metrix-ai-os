// Watch-coverage widening (final consolidation pass §2-3): each adapter is
// a pure function over an already-computed intelligence surface. These
// tests assert real, deterministic evidence output — no LLM involved, and
// no adapter may itself emit a severity/priority conclusion beyond the
// factual severityHint tag already produced by the underlying engine.
import { describe, expect, it } from "vitest";
import {
  evidenceFromTaskContext,
  evidenceFromCustomerHealth,
  evidenceFromFinancialHealth,
  evidenceFromCompanyPerformanceSignal,
  evidenceFromStockSignals,
} from "../executive-autonomous-watch-evidence.service";
import type { TaskContext } from "@/lib/core/tasks/task-context";
import type { CustomerHealthIntelligence, CustomerHealthProfile } from "@/lib/customer-health-intelligence/customer-health-intelligence.types";
import type { FinancialHealthIntelligence } from "@/lib/financial-health-intelligence/financial-health-intelligence.types";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal/company-performance-signal.types";

const emptyTaskContext: TaskContext = { openCount: 0, overdueCount: 0, dueTodayCount: 0, completedCount: 0, priorityBreakdown: { LOW: 0, MEDIUM: 0, HIGH: 0 }, assigneeDistribution: [], openItems: [] };

describe("evidenceFromTaskContext (operational risk)", () => {
  it("emits nothing when there is no overdue backlog", () => {
    expect(evidenceFromTaskContext("org-1", "t", emptyTaskContext)).toEqual([]);
  });

  it("emits one operational fact when tasks are overdue", () => {
    const result = evidenceFromTaskContext("org-1", "t", { ...emptyTaskContext, overdueCount: 6, priorityBreakdown: { LOW: 1, MEDIUM: 2, HIGH: 3 } });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ domain: "TASK_OPERATIONS", severityHint: "HIGH" });
  });
});

describe("evidenceFromCustomerHealth (customer/sales cross-domain)", () => {
  const profile: CustomerHealthProfile = {
    personId: null, customerId: "cust-1", customerName: "Acme A.Ş.", healthScore: 20, healthLabel: "AT_RISK",
    paymentHealth: { overdueCount: 2, totalOverdue: 45000, overdueRatio: 0.6 },
    salesMomentum: { activeQuoteValue: 0, abandonRiskCount: 1, hasActiveQuoteRisk: true },
    activitySignal: { daysSinceLastActivity: 40, isEngaged: false, followUpCount: 0 },
    churnRisk: true, upsellOpportunity: false, repurchaseCandidate: false, opportunityScore: 0,
    recommendedAction: "COLLECTION_MEETING", recommendedActionReason: "Tahsilat gecikti ve sipariş aktivitesi durdu.",
    executiveInsights: [], confidence: "HIGH", customerStatus: "ACTIVE", customerTier: null, storedHealthScore: null, balanceCents: null,
  };
  const intelligence: CustomerHealthIntelligence = {
    profiles: [profile], distribution: { healthyCount: 0, watchCount: 0, atRiskCount: 1, criticalCount: 0 },
    criticalCustomers: [], atRiskCustomers: [profile], watchCustomers: [], topInsights: [], confidence: "HIGH",
    generatedAt: "2026-09-10T00:00:00Z", version: "v1.2",
  };

  it("emits one fact per at-risk/critical customer, already unifying payment + sales + activity — no separate watcher alerts", () => {
    const result = evidenceFromCustomerHealth("org-1", intelligence);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("CUSTOMER_HEALTH");
    expect(result[0].detail).toContain("Gecikmiş tahsilat: 2");
    expect(result[0].detail).toContain("aktif teklif riski: true");
    expect(result[0].fingerprint).toBe("CUSTOMER_HEALTH_cust-1");
  });

  it("skips healthy/watch customers — they are not evidence", () => {
    const result = evidenceFromCustomerHealth("org-1", { ...intelligence, atRiskCustomers: [], watchCustomers: [profile] });
    expect(result).toEqual([]);
  });
});

describe("evidenceFromFinancialHealth (finance cross-domain input)", () => {
  const base: FinancialHealthIntelligence = {
    financialHealthLevel: "MEDIUM", cashPressureLevel: "LOW", collectionCoverageRatio: null, estimatedMonthlyCollections: null,
    monthlyBurnRate: 0, monthToDateCashCollection: null, lastMonthCashCollection: null, cashCollectionGrowthRate: null,
    cashPerformanceLevel: "STABLE", cashPerformanceScore: null, riskWarnings: [], recommendedActions: [],
    executiveSummary: "Nakit durumu stabil.", confidence: "MEDIUM", generatedAt: "2026-09-10T00:00:00Z", version: "v2",
  };

  it("stays silent (no evidence) when cash pressure is low and there are no warnings", () => {
    expect(evidenceFromFinancialHealth("org-1", "t", base)).toEqual([]);
  });

  it("emits a CRITICAL fact under critical cash pressure", () => {
    const result = evidenceFromFinancialHealth("org-1", "t", { ...base, cashPressureLevel: "CRITICAL", riskWarnings: ["3 büyük alacak aynı hafta gecikti."] });
    expect(result).toHaveLength(1);
    expect(result[0].severityHint).toBe("CRITICAL");
    expect(result[0].detail).toContain("3 büyük alacak");
  });
});

describe("evidenceFromCompanyPerformanceSignal (opportunity, same architecture as risk)", () => {
  const base: CompanyPerformanceSignal = {
    generatedAt: "2026-09-10T00:00:00Z", overallScore: 70, performanceLevel: "STABLE", momentum: "STABLE",
    primaryRisk: null, primaryStrength: null, executiveSummary: "s", confidence: "MEDIUM",
    componentScores: {} as CompanyPerformanceSignal["componentScores"], dataGaps: [],
  };

  it("emits an opportunity fact when momentum is accelerating with a named strength", () => {
    const result = evidenceFromCompanyPerformanceSignal("org-1", { ...base, momentum: "ACCELERATING", primaryStrength: "Satış hızı üç aydır artıyor." });
    expect(result).toEqual([expect.objectContaining({ domain: "COMPANY_MOMENTUM", headline: "Satış hızı üç aydır artıyor." })]);
  });

  it("emits a risk fact when momentum is decelerating with a named risk, through the same adapter", () => {
    const result = evidenceFromCompanyPerformanceSignal("org-1", { ...base, momentum: "DECELERATING", performanceLevel: "PRESSURED", primaryRisk: "Yeni sipariş hacmi düşüyor." });
    expect(result).toEqual([expect.objectContaining({ domain: "COMPANY_MOMENTUM", severityHint: "HIGH" })]);
  });

  it("emits nothing when stable with no named driver", () => {
    expect(evidenceFromCompanyPerformanceSignal("org-1", base)).toEqual([]);
  });
});

describe("evidenceFromStockSignals (operational risk)", () => {
  it("emits nothing when there is no canonical data", () => {
    expect(evidenceFromStockSignals("org-1", "t", { status: "INSUFFICIENT_CANONICAL_DATA", healthSummary: "", riskSignalCount: 0, opportunitySignalCount: 0, operationalSignalCount: 0 })).toEqual([]);
  });

  it("emits separate risk/opportunity/operational facts, reusing the engine's own healthSummary verbatim", () => {
    const result = evidenceFromStockSignals("org-1", "t", { status: "AVAILABLE", healthSummary: "Kritik stok 2, aşırı stok 1.", riskSignalCount: 2, opportunitySignalCount: 1, operationalSignalCount: 0 });
    expect(result.map((e) => e.domain)).toEqual(["STOCK_RISK", "STOCK_OPPORTUNITY"]);
    expect(result.every((e) => e.headline === "Kritik stok 2, aşırı stok 1.")).toBe(true);
  });
});
