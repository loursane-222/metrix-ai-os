import type { ExecutiveAlert } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveDecision } from "@/lib/executive-brain/executive-brain.types";
import type { ForecastRiskSignal } from "@/lib/executive-forecasting/executive-forecasting.types";

import { buildDecisionSourceKey } from "./executive-decision-record.repository";

import type {
  BuildExecutiveDecisionRecordCandidatesInput,
  ExecutiveDecisionRecordCandidate,
} from "./executive-decision-loop.types";

const MAX_ALERT_DECISIONS = 2;
const MAX_FORECAST_DECISIONS = 1;

export function buildExecutiveDecisionRecordCandidates(
  input: BuildExecutiveDecisionRecordCandidatesInput,
): ExecutiveDecisionRecordCandidate[] {
  const candidates: ExecutiveDecisionRecordCandidate[] = [];

  const shadowContext =
    input.executiveBrainContext?.mode === "shadow"
      ? input.executiveBrainContext
      : null;
  const primaryDecision = shadowContext?.decisionPackage.primaryDecision ?? null;
  if (primaryDecision && input.recommendationPackage?.hasEnoughContext) {
    candidates.push(buildExecutiveBrainCandidate(input, primaryDecision));
  }

  const visibleAlerts = [
    ...(input.executiveAlerts?.criticalAlerts ?? []),
    ...(input.executiveAlerts?.highAlerts ?? []),
  ].slice(0, MAX_ALERT_DECISIONS);

  for (const alert of visibleAlerts) {
    candidates.push(buildAlertCandidate(input, alert));
  }

  const forecastSignals = (input.executiveForecast?.signals ?? [])
    .filter((signal) => signal.riskLevel === "CRITICAL" || signal.riskLevel === "HIGH")
    .slice(0, MAX_FORECAST_DECISIONS);

  for (const signal of forecastSignals) {
    candidates.push(buildForecastCandidate(input, signal));
  }

  return dedupeCandidates(candidates);
}

function buildExecutiveBrainCandidate(
  input: BuildExecutiveDecisionRecordCandidatesInput,
  decision: ExecutiveDecision,
): ExecutiveDecisionRecordCandidate {
  return {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    sourceType: "EXECUTIVE_BRAIN",
    sourceKey: buildDecisionSourceKey("EXECUTIVE_BRAIN", decision.id),
    sourceSnapshotId: input.sourceSnapshotId ?? null,
    title: decision.title,
    rationale: decision.rationale,
    actionHint: decision.recommendedActions[0] ?? null,
    category: decision.category,
    priority: decision.priority,
    confidenceScore: decision.confidence,
    evidenceJson: {
      evidenceRefs: decision.evidenceRefs,
      recommendationEvidence: input.recommendationPackage?.primaryEvidence ?? [],
    },
    sourcePayload: {
      decision,
      packageConfidence:
        input.executiveBrainContext?.mode === "shadow"
          ? input.executiveBrainContext.decisionPackage.confidence
          : null,
      executiveSummary:
        input.executiveBrainContext?.mode === "shadow"
          ? input.executiveBrainContext.decisionPackage.executiveSummary
          : null,
    },
    decisionDate: input.decisionDate,
  };
}

function buildAlertCandidate(
  input: BuildExecutiveDecisionRecordCandidatesInput,
  alert: ExecutiveAlert,
): ExecutiveDecisionRecordCandidate {
  return {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    sourceType: "ALERT",
    sourceKey: buildDecisionSourceKey("ALERT", alert.id),
    sourceSnapshotId: input.sourceSnapshotId ?? null,
    title: alert.headline,
    rationale: alert.actionableStep
      ? `Bu uyarı aksiyon gerektiriyor: ${alert.actionableStep}`
      : "Bu uyarı yönetim takibi gerektiriyor.",
    actionHint: alert.actionableStep,
    category: alert.category,
    priority: alert.severity,
    confidenceScore: null,
    evidenceJson: {
      source: alert.source,
      severity: alert.severity,
      category: alert.category,
    },
    sourcePayload: { alert },
    decisionDate: input.decisionDate,
  };
}

function buildForecastCandidate(
  input: BuildExecutiveDecisionRecordCandidatesInput,
  signal: ForecastRiskSignal,
): ExecutiveDecisionRecordCandidate {
  return {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    sourceType: "FORECAST_SIGNAL",
    sourceKey: buildDecisionSourceKey("FORECAST_SIGNAL", signal.riskType),
    sourceSnapshotId: input.sourceSnapshotId ?? null,
    title: signal.headline,
    rationale: signal.explanation,
    actionHint: signal.actionableStep,
    category: signal.riskType,
    priority: signal.riskLevel,
    confidenceScore: signal.confidenceScore,
    evidenceJson: {
      evidence: signal.evidence,
      dataLimitations: signal.dataLimitations,
    },
    sourcePayload: { signal },
    decisionDate: input.decisionDate,
  };
}

function dedupeCandidates(
  candidates: ExecutiveDecisionRecordCandidate[],
): ExecutiveDecisionRecordCandidate[] {
  const seen = new Set<string>();
  const unique: ExecutiveDecisionRecordCandidate[] = [];

  for (const candidate of candidates) {
    const key = [
      candidate.organizationId,
      candidate.decisionDate,
      candidate.sourceType,
      candidate.sourceKey,
    ].join(":");

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}
