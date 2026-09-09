// Stage 2 (Executive Awareness / Always-On Watch) canonical types.
//
// These types exist ONLY to move deterministic observations into the single
// Executive Agent for judgment, and to persist the Agent's judgment as a
// restart-safe lifecycle record. Nothing in this file decides significance,
// priority, or intervene/stay-silent — that authority lives exclusively in
// src/lib/executive-agent (see runAwarenessJudgment).

import type { AlertCategory, AlertSeverity } from "@/lib/executive-alerts/executive-alert.types";

/**
 * Evidence domain tags. AlertCategory values come from the existing
 * executive-alerts engine (finance/collections/forecast/sales-pipeline/
 * execution/currency/market/strategic); the rest are Stage 2 watch-coverage
 * widening (Grand Consolidation, final pass §2-3) — thin factual adapters
 * over already-computed, already-production intelligence surfaces.
 */
export type AwarenessEvidenceDomain =
  | AlertCategory
  | "TASK_OPERATIONS"
  | "CUSTOMER_HEALTH"
  | "FINANCIAL_HEALTH"
  | "STOCK_RISK"
  | "STOCK_OPPORTUNITY"
  | "STOCK_OPERATIONAL"
  | "COMPANY_MOMENTUM";

export type AwarenessEvidenceSource =
  | "executive-alerts"
  | "task-context"
  | "customer-health-intelligence"
  | "financial-health-intelligence"
  | "stock-intelligence"
  | "company-performance-signal";

/** One atomic, deterministic fact observed from company data. No judgment. */
export type AwarenessEvidenceEnvelope = Readonly<{
  organizationId: string;
  /** Stable across runs for the same underlying fact — this is the dedup unit. */
  fingerprint: string;
  domain: AwarenessEvidenceDomain;
  severityHint: AlertSeverity;
  headline: string;
  detail: string | null;
  observedAt: string;
  source: AwarenessEvidenceSource;
}>;

export const AWARENESS_CATEGORIES = ["KRITIK", "FINANS", "SATIS", "GOREVLER"] as const;
export type AwarenessNotificationCategory = (typeof AWARENESS_CATEGORIES)[number];

export const AWARENESS_SIGNIFICANCE = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type AwarenessSignificance = (typeof AWARENESS_SIGNIFICANCE)[number];

export const AWARENESS_URGENCY = ["LOW", "MEDIUM", "HIGH", "IMMEDIATE"] as const;
export type AwarenessUrgency = (typeof AWARENESS_URGENCY)[number];

export type AwarenessDisposition = "SILENT" | "INTERVENE";

/**
 * The Executive Agent's structured judgment on one correlated group of
 * evidence. `evidenceFingerprints` is how the Agent tells us which atomic
 * facts it grouped together — the runtime derives the persisted lifecycle
 * identity from this deterministic set, never from the Agent's prose, so
 * dedup/escalation/resolution stay stable across runs even though the
 * correlation judgment itself is the Agent's call.
 */
export type AwarenessJudgment = Readonly<{
  correlationTitle: string;
  evidenceFingerprints: readonly string[];
  disposition: AwarenessDisposition;
  significance: AwarenessSignificance;
  confidence: number;
  reason: string;
  insight: string;
  recommendedNextMove: string | null;
  urgency: AwarenessUrgency;
  category: AwarenessNotificationCategory;
  deliveryEligible: boolean;
}>;

export type AwarenessInsightLifecycleStatus = "OPEN" | "RESOLVED" | "SUPERSEDED";
