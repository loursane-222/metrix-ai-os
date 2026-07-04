import type {
  BuildExecutiveNarrativeInput,
  ExecutiveNarrative,
  ExecutiveNarrativePosture,
  ExecutiveNarrativeTone,
} from "./executive-narrative.types";
import {
  buildBriefingNarrative,
  buildDataQualityLanguage,
  buildNarrativeExecutiveSummary,
  buildNarrativeManagementMeaning,
  buildNarrativeOpeningLine,
  buildPromptNarrative,
  buildRiskLanguage,
  directionToText,
  levelToPosture,
  scorecardAreaLabel,
} from "./executive-narrative-summary.service";

const MAX_EVIDENCE = 8;

export function buildExecutiveNarrative(
  input: BuildExecutiveNarrativeInput,
): ExecutiveNarrative {
  const failedSteps = input.failedSteps ?? [];
  const evidence = new UniqueList(MAX_EVIDENCE);

  collectEvidence(input, evidence);

  const posture = resolvePosture(input, failedSteps);
  const tone = resolveTone(input, posture, failedSteps);
  const weakestAreaLabel = scorecardAreaLabel(input.executiveScorecard?.weakestArea ?? null);
  const strongestAreaLabel = scorecardAreaLabel(input.executiveScorecard?.strongestArea ?? null);
  const hasOverdueDecision = input.executiveDecisionContext?.overdueCommittedDecision !== null &&
    input.executiveDecisionContext?.overdueCommittedDecision !== undefined;
  const firstAttention = resolveFirstAttention(input, weakestAreaLabel);
  const directionText = directionToText(input.executiveAwareness?.overallDirection);

  const openingLine = buildNarrativeOpeningLine({
    posture,
    weakestAreaLabel,
    hasOverdueDecision,
  });
  const executiveSummary = buildNarrativeExecutiveSummary({
    posture,
    weakestAreaLabel,
    strongestAreaLabel,
    directionText,
  });
  const managementMeaning = buildNarrativeManagementMeaning({
    posture,
    firstAttention,
  });
  const riskLanguage = buildRiskLanguage({
    posture,
    criticalCount: input.executiveAlerts?.criticalAlerts.length ?? 0,
    highCount: input.executiveAlerts?.highAlerts.length ?? 0,
    trendDirection: input.signalTrendContext?.trendDirection ?? null,
  });
  const dataQualityLanguage = buildDataQualityLanguage({
    hasLowConfidence: hasLowConfidence(input),
    failedSteps,
    dataQualityNote:
      input.executiveAwareness?.dataQualityNote ??
      input.executiveScorecard?.dataQualityNote ??
      null,
  });

  return {
    generatedAt: new Date().toISOString(),
    tone,
    posture,
    openingLine,
    executiveSummary,
    managementMeaning,
    firstAttention,
    riskLanguage,
    dataQualityLanguage,
    briefingNarrative: buildBriefingNarrative({
      openingLine,
      executiveSummary,
      firstAttention,
    }),
    promptNarrative: buildPromptNarrative({
      openingLine,
      managementMeaning,
      riskLanguage,
      dataQualityLanguage,
    }),
    evidence: evidence.values,
  };
}

function resolvePosture(
  input: BuildExecutiveNarrativeInput,
  failedSteps: string[],
): ExecutiveNarrativePosture {
  if (failedSteps.length > 0 || hasLowConfidence(input)) return "UNCERTAIN";
  if (
    input.executiveAwareness?.overallDirection === "CRITICAL" ||
    input.executiveAwareness?.businessPosture === "AT_RISK" ||
    input.executiveScorecard?.overallLevel === "AT_RISK" ||
    (input.executiveAlerts?.criticalAlerts.length ?? 0) > 0 ||
    input.executiveForecast?.overallRiskLevel === "CRITICAL"
  ) {
    return "CRITICAL";
  }
  if (
    input.executiveAwareness?.businessPosture === "PRESSURED" ||
    input.executiveScorecard?.overallLevel === "PRESSURED" ||
    input.executiveForecast?.overallRiskLevel === "HIGH" ||
    (input.executiveAlerts?.highAlerts.length ?? 0) > 0
  ) {
    return "PRESSURE";
  }
  if (
    input.executiveAwareness?.businessPosture === "WATCH" ||
    input.executiveScorecard?.overallLevel === "WATCH" ||
    input.executiveForecast?.overallRiskLevel === "WATCH" ||
    (input.executiveAlerts?.watchAlerts.length ?? 0) > 0 ||
    input.signalTrendContext?.trendDirection === "RISING"
  ) {
    return "WATCHFUL";
  }

  return levelToPosture(input.executiveScorecard?.overallLevel ?? null);
}

function resolveTone(
  input: BuildExecutiveNarrativeInput,
  posture: ExecutiveNarrativePosture,
  failedSteps: string[],
): ExecutiveNarrativeTone {
  if (posture === "UNCERTAIN" || failedSteps.length > 0 || hasLowConfidence(input)) {
    return "CAUTIOUS";
  }
  if (posture === "CRITICAL") return "URGENT";
  if (posture === "PRESSURE") return "DIRECT";
  return "CALM";
}

function resolveFirstAttention(
  input: BuildExecutiveNarrativeInput,
  weakestAreaLabel: string | null,
): string | null {
  const overdue = input.executiveDecisionContext?.overdueCommittedDecision;
  if (overdue) return `"${overdue.title}" kararinin sonucunu netlestir.`;

  const priority = input.executiveRhythm?.priorities[0];
  if (priority?.actionHint) return priority.actionHint;
  if (priority?.headline) return priority.headline;

  const criticalAlert = input.executiveAlerts?.criticalAlerts[0];
  if (criticalAlert?.actionableStep) return criticalAlert.actionableStep;
  if (criticalAlert?.headline) return criticalAlert.headline;

  const attention = input.executiveAwareness?.recommendedAttention[0];
  if (attention) return attention;

  return weakestAreaLabel ? `${weakestAreaLabel} alanini kontrol et.` : null;
}

function hasLowConfidence(input: BuildExecutiveNarrativeInput): boolean {
  return (
    input.executiveAwareness?.confidence === "LOW" ||
    input.executiveScorecard?.confidence === "LOW" ||
    input.executiveForecast?.overallConfidence === "LOW"
  );
}

function collectEvidence(
  input: BuildExecutiveNarrativeInput,
  evidence: UniqueList,
): void {
  evidence.add(input.executiveAwareness?.overallDirection
    ? `Direction: ${input.executiveAwareness.overallDirection}`
    : null);
  evidence.add(input.executiveAwareness?.businessPosture
    ? `Posture: ${input.executiveAwareness.businessPosture}`
    : null);
  evidence.add(input.executiveScorecard?.overallLevel
    ? `Health: ${input.executiveScorecard.overallLevel}`
    : null);
  evidence.add(input.executiveScorecard?.weakestArea
    ? `Weakest area: ${input.executiveScorecard.weakestArea}`
    : null);
  evidence.add(input.executiveForecast?.overallRiskLevel
    ? `Forecast risk: ${input.executiveForecast.overallRiskLevel}`
    : null);
  evidence.add(input.executiveAlerts
    ? `Alerts: ${input.executiveAlerts.criticalAlerts.length} critical, ${input.executiveAlerts.highAlerts.length} high`
    : null);
  evidence.add(input.signalTrendContext?.hasData
    ? `Trend: ${input.signalTrendContext.trendDirection}`
    : null);
  evidence.add(input.executiveRhythm?.primaryFocusArea
    ? `Focus: ${input.executiveRhythm.primaryFocusArea}`
    : null);
  evidence.add(input.latestBriefing
    ? `Briefing items: ${input.latestBriefing.kritikItems.length} critical`
    : null);
}

class UniqueList {
  private readonly seen = new Set<string>();
  readonly values: string[] = [];

  constructor(private readonly max: number) {}

  add(value: string | null | undefined): void {
    const normalized = value?.trim();
    if (!normalized || this.values.length >= this.max) return;

    const key = normalized.toLocaleLowerCase("tr-TR");
    if (this.seen.has(key)) return;

    this.seen.add(key);
    this.values.push(normalized);
  }
}
