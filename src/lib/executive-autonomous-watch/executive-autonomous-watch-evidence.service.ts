// Observation Layer adapter (Grand Consolidation §5.1): turns the existing,
// already-proven deterministic executive-alerts engine into canonical
// evidence envelopes. Produces facts only — no "critical"/"do this" framing,
// no priority judgment. That belongs solely to the Executive Agent.

import type { ExecutiveAlert, ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { TaskContext } from "@/lib/core/tasks/task-context";
import type { CustomerHealthIntelligence, CustomerHealthProfile } from "@/lib/customer-health-intelligence/customer-health-intelligence.types";
import type { FinancialHealthIntelligence } from "@/lib/financial-health-intelligence/financial-health-intelligence.types";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal/company-performance-signal.types";
import type { AwarenessEvidenceEnvelope } from "./executive-autonomous-watch.types";

export function evidenceFromAlertBundle(bundle: ExecutiveAlertBundle): AwarenessEvidenceEnvelope[] {
  const all: ExecutiveAlert[] = [...bundle.criticalAlerts, ...bundle.highAlerts, ...bundle.watchAlerts];
  return all.map((alert) => toEnvelope(bundle.organizationId, bundle.generatedAt, alert));
}

function toEnvelope(organizationId: string, generatedAt: string, alert: ExecutiveAlert): AwarenessEvidenceEnvelope {
  return {
    organizationId,
    // alert.id is already the alert engine's own stable cross-run identity
    // (the retired watch service keyed its re-notify window off it) — reuse
    // it verbatim rather than inventing a second fingerprint scheme.
    fingerprint: alert.id,
    domain: alert.category,
    severityHint: alert.severity,
    headline: alert.headline,
    detail: alert.actionableStep,
    observedAt: generatedAt,
    source: "executive-alerts",
  };
}

/** Tasks/operations. One standing fact — the specific overdue set changes
 * run to run, but the "operational overdue backlog" identity persists. */
export function evidenceFromTaskContext(
  organizationId: string,
  observedAt: string,
  taskContext: TaskContext,
): AwarenessEvidenceEnvelope[] {
  if (taskContext.overdueCount === 0) return [];
  const severityHint = taskContext.overdueCount >= 5 || taskContext.priorityBreakdown.HIGH >= 3 ? "HIGH" : "WATCH";
  return [{
    organizationId,
    fingerprint: "TASK_OPERATIONS_OVERDUE_BACKLOG",
    domain: "TASK_OPERATIONS",
    severityHint,
    headline: `${taskContext.overdueCount} gecikmiş görev (${taskContext.priorityBreakdown.HIGH} yüksek öncelikli).`,
    detail: `Bugün vadesi gelen: ${taskContext.dueTodayCount}, açık toplam: ${taskContext.openCount}.`,
    observedAt,
    source: "task-context",
  }];
}

/** Customers/sales cross-domain: each at-risk/critical profile already
 * unifies payment health + sales momentum + activity into one deterministic
 * fact, so one evidence envelope per customer is the correct grain here —
 * no further correlation is needed before this reaches the Executive Agent. */
export function evidenceFromCustomerHealth(
  organizationId: string,
  intelligence: CustomerHealthIntelligence,
): AwarenessEvidenceEnvelope[] {
  const profiles = [...intelligence.criticalCustomers, ...intelligence.atRiskCustomers].slice(0, 8);
  return profiles.map((profile) => toCustomerEnvelope(organizationId, intelligence.generatedAt, profile));
}

function toCustomerEnvelope(organizationId: string, observedAt: string, profile: CustomerHealthProfile): AwarenessEvidenceEnvelope {
  const entityId = profile.customerId ?? profile.personId ?? profile.customerName;
  return {
    organizationId,
    fingerprint: `CUSTOMER_HEALTH_${entityId}`,
    domain: "CUSTOMER_HEALTH",
    severityHint: profile.healthLabel === "CRITICAL" ? "CRITICAL" : "HIGH",
    headline: `${profile.customerName}: ${profile.recommendedActionReason}`,
    detail: `Gecikmiş tahsilat: ${profile.paymentHealth.overdueCount} (₺${profile.paymentHealth.totalOverdue}), aktif teklif riski: ${profile.salesMomentum.hasActiveQuoteRisk}, son etkileşim: ${profile.activitySignal.daysSinceLastActivity} gün önce.`,
    observedAt,
    source: "customer-health-intelligence",
  };
}

/** Finance/cost: one standing fact when cash pressure or risk warnings are
 * currently present — the specific figures change run to run. */
export function evidenceFromFinancialHealth(
  organizationId: string,
  observedAt: string,
  intelligence: FinancialHealthIntelligence,
): AwarenessEvidenceEnvelope[] {
  const isPressured = intelligence.cashPressureLevel === "HIGH" || intelligence.cashPressureLevel === "CRITICAL";
  if (!isPressured && intelligence.riskWarnings.length === 0) return [];
  return [{
    organizationId,
    fingerprint: "FINANCIAL_HEALTH_STANDING",
    domain: "FINANCIAL_HEALTH",
    severityHint: intelligence.cashPressureLevel === "CRITICAL" ? "CRITICAL" : intelligence.cashPressureLevel === "HIGH" ? "HIGH" : "WATCH",
    headline: intelligence.executiveSummary,
    detail: intelligence.riskWarnings.join(" ") || null,
    observedAt,
    source: "financial-health-intelligence",
  }];
}

/** Opportunity + strategic risk from the same deterministic company-wide
 * momentum signal — proves the architecture handles opportunity exactly
 * like risk, not through a separate path. */
export function evidenceFromCompanyPerformanceSignal(
  organizationId: string,
  signal: CompanyPerformanceSignal,
): AwarenessEvidenceEnvelope[] {
  const envelopes: AwarenessEvidenceEnvelope[] = [];
  if (signal.momentum === "ACCELERATING" && signal.primaryStrength) {
    envelopes.push({
      organizationId,
      fingerprint: "COMPANY_MOMENTUM_OPPORTUNITY",
      domain: "COMPANY_MOMENTUM",
      severityHint: "WATCH",
      headline: signal.primaryStrength,
      detail: signal.executiveSummary,
      observedAt: signal.generatedAt,
      source: "company-performance-signal",
    });
  }
  if (signal.momentum === "DECELERATING" && signal.primaryRisk) {
    envelopes.push({
      organizationId,
      fingerprint: "COMPANY_MOMENTUM_RISK",
      domain: "COMPANY_MOMENTUM",
      severityHint: signal.performanceLevel === "PRESSURED" ? "HIGH" : "WATCH",
      headline: signal.primaryRisk,
      detail: signal.executiveSummary,
      observedAt: signal.generatedAt,
      source: "company-performance-signal",
    });
  }
  return envelopes;
}

export type StockExecutiveSignals = Readonly<{
  status: "AVAILABLE" | string;
  healthSummary: string;
  riskSignalCount: number;
  opportunitySignalCount: number;
  operationalSignalCount: number;
}>;

/** Stock — one standing fact per bucket (risk/opportunity/operational),
 * reusing the existing computeExecutiveSignals engine's own counts and its
 * already-composed Turkish healthSummary sentence verbatim. */
export function evidenceFromStockSignals(
  organizationId: string,
  observedAt: string,
  signals: StockExecutiveSignals,
): AwarenessEvidenceEnvelope[] {
  if (signals.status !== "AVAILABLE") return [];
  const envelopes: AwarenessEvidenceEnvelope[] = [];
  if (signals.riskSignalCount > 0) {
    envelopes.push({
      organizationId, fingerprint: "STOCK_RISK_STANDING", domain: "STOCK_RISK",
      severityHint: signals.riskSignalCount >= 5 ? "HIGH" : "WATCH",
      headline: signals.healthSummary, detail: null, observedAt, source: "stock-intelligence",
    });
  }
  if (signals.opportunitySignalCount > 0) {
    envelopes.push({
      organizationId, fingerprint: "STOCK_OPPORTUNITY_STANDING", domain: "STOCK_OPPORTUNITY",
      severityHint: "WATCH", headline: signals.healthSummary, detail: null, observedAt, source: "stock-intelligence",
    });
  }
  if (signals.operationalSignalCount > 0) {
    envelopes.push({
      organizationId, fingerprint: "STOCK_OPERATIONAL_STANDING", domain: "STOCK_OPERATIONAL",
      severityHint: "WATCH", headline: signals.healthSummary, detail: null, observedAt, source: "stock-intelligence",
    });
  }
  return envelopes;
}
