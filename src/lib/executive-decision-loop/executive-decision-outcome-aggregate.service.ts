import { prisma } from "@/lib/core/shared/prisma";
import type { DecisionDisciplineRiskTier, DecisionDisciplineTrend, ExecutiveDecisionOutcomeAggregate } from "./executive-decision-loop.types";
import { buildOutcomePatternData } from "./executive-decision-outcome-pattern.service";

const WINDOW_DAYS = 30;
const PREV_WINDOW_DAYS = 60;
const STALE_PROPOSED_DAYS = 3;
const MIN_FOR_RATE = 3;
const MIN_FOR_HIGH_CONFIDENCE = 8;
const TREND_DIRECTION_THRESHOLD = 0.05;

export async function buildExecutiveDecisionOutcomeAggregate(
  organizationId: string,
  now?: Date,
): Promise<ExecutiveDecisionOutcomeAggregate> {
  const reference = now ?? new Date();
  const windowStart = new Date(reference.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const previousWindowStart = new Date(reference.getTime() - PREV_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const staleThreshold = new Date(reference.getTime() - STALE_PROPOSED_DAYS * 24 * 60 * 60 * 1000);

  const [outcomes, closedRecords, staleOpenCount, patternData, prevOutcomes] = await Promise.all([
    prisma.executiveDecisionOutcome.findMany({
      where: { organizationId, occurredAt: { gte: windowStart } },
      select: { outcome: true },
    }),
    prisma.executiveDecisionRecord.findMany({
      where: {
        organizationId,
        status: "CLOSED",
        closedAt: { gte: windowStart },
        committedAt: { not: null },
      },
      select: { committedAt: true, closedAt: true },
    }),
    // staleOpenCount: createdAt kullanılıyor — decisionDate string olduğundan
    // DateTime karşılaştırması için güvenli alan createdAt'tır.
    prisma.executiveDecisionRecord.count({
      where: {
        organizationId,
        status: "PROPOSED",
        createdAt: { lte: staleThreshold },
      },
    }),
    buildOutcomePatternData(organizationId, windowStart),
    prisma.executiveDecisionOutcome.findMany({
      where: { organizationId, occurredAt: { gte: previousWindowStart, lt: windowStart } },
      select: { outcome: true },
    }),
  ]);

  const successCount = outcomes.filter((o) => o.outcome === "SUCCESS").length;
  const failureCount = outcomes.filter((o) => o.outcome === "FAILURE").length;
  const abandonedCount = outcomes.filter((o) => o.outcome === "ABANDONED").length;
  const totalClosed = outcomes.length;

  const successRate = totalClosed >= MIN_FOR_RATE ? successCount / totalClosed : null;
  const failureRate = totalClosed >= MIN_FOR_RATE ? failureCount / totalClosed : null;
  const qualitySignal = resolveQualitySignal(successRate, totalClosed);
  const confidence = resolveConfidence(totalClosed);
  const repeatedFailureCount = patternData.repeatedFailureCount;
  const reAgendaCount = patternData.reAgendaCount;
  const avgCommitToCloseDays = computeAvgCommitToCloseDays(closedRecords);

  const prevTotalClosed = prevOutcomes.length;
  const prevSuccessCount = prevOutcomes.filter((o) => o.outcome === "SUCCESS").length;
  const previousSuccessRate = prevTotalClosed >= MIN_FOR_RATE ? prevSuccessCount / prevTotalClosed : null;
  const trend = computeTrend(successRate, previousSuccessRate, prevTotalClosed);

  return {
    organizationId,
    windowDays: WINDOW_DAYS,
    totalClosed,
    successCount,
    failureCount,
    abandonedCount,
    successRate,
    failureRate,
    avgCommitToCloseDays,
    staleOpenCount,
    qualitySignal,
    confidence,
    repeatedFailureCount,
    reAgendaCount,
    riskTier: resolveRiskTier({ qualitySignal, confidence, repeatedFailureCount, reAgendaCount, failureRate }),
    trend,
  };
}

function computeTrend(
  currentSuccessRate: number | null,
  previousSuccessRate: number | null,
  previousTotalClosed: number,
): DecisionDisciplineTrend | null {
  if (currentSuccessRate === null || previousSuccessRate === null) return null;

  const delta = currentSuccessRate - previousSuccessRate;
  const direction =
    delta > TREND_DIRECTION_THRESHOLD
      ? "IMPROVING"
      : delta < -TREND_DIRECTION_THRESHOLD
        ? "DECLINING"
        : "STABLE";

  return {
    direction,
    previousSuccessRate,
    currentSuccessRate,
    delta,
    previousTotalClosed,
  };
}

function resolveQualitySignal(
  successRate: number | null,
  totalClosed: number,
): ExecutiveDecisionOutcomeAggregate["qualitySignal"] {
  if (totalClosed < MIN_FOR_RATE || successRate === null) return "UNKNOWN";
  if (successRate >= 0.65) return "STRONG";
  if (successRate >= 0.40) return "WATCH";
  return "WEAK";
}

function resolveConfidence(totalClosed: number): ExecutiveDecisionOutcomeAggregate["confidence"] {
  if (totalClosed >= MIN_FOR_HIGH_CONFIDENCE) return "HIGH";
  if (totalClosed >= MIN_FOR_RATE) return "MEDIUM";
  return "LOW";
}

function resolveRiskTier(input: {
  qualitySignal: ExecutiveDecisionOutcomeAggregate["qualitySignal"];
  confidence: ExecutiveDecisionOutcomeAggregate["confidence"];
  repeatedFailureCount: number;
  reAgendaCount: number;
  failureRate: number | null;
}): DecisionDisciplineRiskTier | null {
  if (input.confidence === "LOW") return null;

  const hasRepeatedPattern = input.repeatedFailureCount >= 1;
  const hasBaseRisk =
    input.qualitySignal === "WEAK" ||
    hasRepeatedPattern ||
    input.reAgendaCount >= 2 ||
    (input.failureRate !== null && input.failureRate >= 0.4);

  const isCriticalPattern =
    hasBaseRisk &&
    input.confidence === "HIGH" &&
    (hasRepeatedPattern || (input.failureRate !== null && input.failureRate >= 0.5));

  const shouldChallenge = input.confidence === "HIGH" && hasRepeatedPattern;

  return { hasBaseRisk, hasRepeatedPattern, isCriticalPattern, shouldChallenge };
}

function computeAvgCommitToCloseDays(
  records: Array<{ committedAt: Date | null; closedAt: Date | null }>,
): number | null {
  const valid = records.filter(
    (r): r is { committedAt: Date; closedAt: Date } =>
      r.committedAt !== null && r.closedAt !== null,
  );
  if (valid.length === 0) return null;

  const totalMs = valid.reduce(
    (sum, r) => sum + (r.closedAt.getTime() - r.committedAt.getTime()),
    0,
  );

  return Math.round(totalMs / valid.length / (24 * 60 * 60 * 1000));
}
