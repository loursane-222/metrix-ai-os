import type { AlertCategory } from "@/lib/executive-alerts/executive-alert.types";
import type {
  ExecutiveScorecardArea,
  ExecutiveScorecardAreaResult,
  ExecutiveScorecardLevel,
} from "@/lib/executive-scorecard";
import type {
  BuildDirectorOpinionsInput,
  DirectorOpinion,
  DirectorOpinionAction,
  DirectorOpinionBundle,
  DirectorOpinionEvidence,
  DirectorOpinionRisk,
  DirectorOpinionSignal,
  DirectorOpinionUrgency,
  DirectorType,
} from "./director-opinion.types";
import {
  addEvidence,
  addUnique,
  buildCrossFunctionalConflicts,
  buildOpinionSummary,
  buildTopConcerns,
  resolveBundleConfidence,
  resolveOpinionConfidence,
  resolveOpinionUrgency,
} from "./director-opinion-summary.service";

const VERSION = "v1" as const;
const MAX_ITEMS = 4;
const MAX_EVIDENCE = 6;

export function buildDirectorOpinions(
  input: BuildDirectorOpinionsInput,
): DirectorOpinionBundle {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const opinions: DirectorOpinion[] = [
    buildFinanceOpinion(input, generatedAt),
    buildSalesOpinion(input, generatedAt),
    buildOperationsOpinion(input, generatedAt),
    buildStrategyOpinion(input, generatedAt),
    buildResearchOpinion(input, generatedAt),
  ];

  return {
    organizationId: input.organizationId,
    generatedAt,
    version: VERSION,
    opinions,
    topConcerns: buildTopConcerns(opinions),
    crossFunctionalConflicts: buildCrossFunctionalConflicts(opinions),
    confidence: resolveBundleConfidence(opinions),
  };
}

function buildFinanceOpinion(
  input: BuildDirectorOpinionsInput,
  generatedAt: string,
): DirectorOpinion {
  const signals: DirectorOpinionSignal[] = [];
  const risks: DirectorOpinionRisk[] = [];
  const opportunities: DirectorOpinion["opportunities"] = [];
  const actions: DirectorOpinionAction[] = [];
  const evidence: DirectorOpinionEvidence[] = [];

  const payment = input.paymentIntelligence;
  if (payment) {
    addUnique(signals, {
      title: "Cash and collection reading",
      detail: payment.executiveSummary,
      source: "payment_intelligence",
    }, MAX_ITEMS);
    addEvidence(evidence, {
      source: "payment_intelligence",
      label: "Cash risk",
      value: payment.cashRiskLevel,
    }, MAX_EVIDENCE);
    addEvidence(evidence, {
      source: "payment_intelligence",
      label: "Collection pressure",
      value: payment.collectionPressure,
    }, MAX_EVIDENCE);

    if (payment.cashRiskLevel === "CRITICAL" || payment.cashRiskLevel === "HIGH") {
      addUnique(risks, {
        title: "Cash pressure requires management attention",
        severity: payment.cashRiskLevel === "CRITICAL" ? "URGENT" : "IMPORTANT",
        explanation: payment.executiveSummary,
      }, MAX_ITEMS);
    }

    for (const action of payment.nextBestActions.slice(0, 2)) {
      addUnique(actions, {
        title: action,
        rationale: "Payment intelligence selected this as a finance next best action.",
        urgency: payment.cashRiskLevel === "CRITICAL" ? "URGENT" : "IMPORTANT",
      }, MAX_ITEMS);
    }

    if (!payment.hasActiveRisk) {
      addUnique(opportunities, {
        title: "Finance pressure is currently controlled",
        impact: "MEDIUM",
        explanation: "No active high cash or collection risk is visible in payment intelligence.",
      }, MAX_ITEMS);
    }
  }

  const paymentContext = input.paymentContext;
  if (paymentContext) {
    addEvidence(evidence, {
      source: "payment_context",
      label: "Total overdue",
      value: String(paymentContext.totalOverdue),
    }, MAX_EVIDENCE);
    if (paymentContext.totalOverdue > 0) {
      addUnique(risks, {
        title: "Overdue receivables remain open",
        severity: paymentContext.overdueCount >= 2 ? "IMPORTANT" : "WATCH",
        explanation: `${paymentContext.overdueCount} overdue payment item exists.`,
      }, MAX_ITEMS);
    }
  }

  collectForecastRisks(input, ["CASH_FLOW", "COLLECTION_RISK"], risks, actions, evidence);
  collectAlertRisks(input, ["CASH_FLOW_RISK", "COLLECTION_PRESSURE"], risks, actions, evidence);
  collectScorecardEvidence(input, ["CASH_HEALTH", "COLLECTION_HEALTH"], risks, evidence);
  collectFailedStepEvidence(input, evidence);

  return finalizeOpinion({
    directorType: "FINANCE_DIRECTOR",
    opinionTitle: "Finance Director Opinion",
    fallbackSummary: "Finance opinion has limited evidence; cash and collection should stay under routine review.",
    signals,
    risks,
    opportunities,
    actions,
    evidence,
    generatedAt,
    hasCoreSignal: Boolean(payment || paymentContext),
    failedSteps: input.failedSteps,
  });
}

function buildSalesOpinion(
  input: BuildDirectorOpinionsInput,
  generatedAt: string,
): DirectorOpinion {
  const signals: DirectorOpinionSignal[] = [];
  const risks: DirectorOpinionRisk[] = [];
  const opportunities: DirectorOpinion["opportunities"] = [];
  const actions: DirectorOpinionAction[] = [];
  const evidence: DirectorOpinionEvidence[] = [];

  const quote = input.quoteIntelligence;
  if (quote) {
    addUnique(signals, {
      title: "Sales pipeline reading",
      detail: quote.executiveSummary,
      source: "quote_intelligence",
    }, MAX_ITEMS);
    addEvidence(evidence, {
      source: "quote_intelligence",
      label: "Quote risk",
      value: quote.quoteRiskLevel,
    }, MAX_EVIDENCE);
    addEvidence(evidence, {
      source: "quote_intelligence",
      label: "Active quote count",
      value: String(quote.activeQuoteCount),
    }, MAX_EVIDENCE);

    if (quote.quoteRiskLevel === "CRITICAL" || quote.quoteRiskLevel === "HIGH") {
      addUnique(risks, {
        title: "Pipeline quality needs intervention",
        severity: quote.quoteRiskLevel === "CRITICAL" ? "URGENT" : "IMPORTANT",
        explanation: quote.executiveSummary,
      }, MAX_ITEMS);
    }

    if (quote.hasActiveOpportunity) {
      addUnique(opportunities, {
        title: "Active commercial opportunity is visible",
        impact: quote.hotQuoteCount > 0 ? "HIGH" : "MEDIUM",
        explanation: quote.quotePipelineSummary,
      }, MAX_ITEMS);
    }

    for (const action of quote.nextBestActions.slice(0, 2)) {
      addUnique(actions, {
        title: action,
        rationale: "Quote intelligence selected this as a sales next best action.",
        urgency: quote.quoteRiskLevel === "CRITICAL" ? "URGENT" : "IMPORTANT",
      }, MAX_ITEMS);
    }
  }

  const quoteContext = input.quoteContext;
  if (quoteContext) {
    addEvidence(evidence, {
      source: "quote_context",
      label: "Open quote value",
      value: String(quoteContext.openTotal),
    }, MAX_EVIDENCE);
  }

  collectForecastRisks(input, ["QUOTE_CONVERSION"], risks, actions, evidence);
  collectAlertRisks(input, ["QUOTE_PIPELINE_RISK"], risks, actions, evidence);
  collectScorecardEvidence(input, ["SALES_PIPELINE_HEALTH"], risks, evidence);
  collectFailedStepEvidence(input, evidence);

  return finalizeOpinion({
    directorType: "SALES_DIRECTOR",
    opinionTitle: "Sales Director Opinion",
    fallbackSummary: "Sales opinion has limited evidence; pipeline, quote freshness, and conversion need routine review.",
    signals,
    risks,
    opportunities,
    actions,
    evidence,
    generatedAt,
    hasCoreSignal: Boolean(quote || quoteContext),
    failedSteps: input.failedSteps,
  });
}

function buildOperationsOpinion(
  input: BuildDirectorOpinionsInput,
  generatedAt: string,
): DirectorOpinion {
  const signals: DirectorOpinionSignal[] = [];
  const risks: DirectorOpinionRisk[] = [];
  const opportunities: DirectorOpinion["opportunities"] = [];
  const actions: DirectorOpinionAction[] = [];
  const evidence: DirectorOpinionEvidence[] = [];

  const collection = input.collectionActionContext;
  if (collection) {
    addUnique(signals, {
      title: "Execution action reading",
      detail: `${collection.openCount} open and ${collection.inProgressCount} in-progress collection actions are visible.`,
      source: "collection_action",
    }, MAX_ITEMS);
    addEvidence(evidence, {
      source: "collection_action",
      label: "Open actions",
      value: String(collection.openCount),
    }, MAX_EVIDENCE);
    addEvidence(evidence, {
      source: "collection_action",
      label: "In-progress actions",
      value: String(collection.inProgressCount),
    }, MAX_EVIDENCE);

    const stale14 = collection.items.filter(
      (item) => item.status === "OPEN" && item.daysOpen >= 14,
    );
    const stale7 = collection.items.filter(
      (item) => item.status === "OPEN" && item.daysOpen >= 7,
    );

    if (stale14.length > 0 || stale7.length > 0) {
      addUnique(risks, {
        title: "Execution follow-up is aging",
        severity: stale14.length > 0 ? "IMPORTANT" : "WATCH",
        explanation: `${stale14.length > 0 ? stale14.length : stale7.length} open action item is aging.`,
      }, MAX_ITEMS);
    } else {
      addUnique(opportunities, {
        title: "Execution action aging is controlled",
        impact: "MEDIUM",
        explanation: "No stale open collection action is visible in the current action context.",
      }, MAX_ITEMS);
    }
  }

  const decision = input.executiveDecisionContext;
  if (decision?.overdueCommittedDecision) {
    addUnique(risks, {
      title: "Committed decision is overdue",
      severity: "URGENT",
      explanation: `"${decision.overdueCommittedDecision.title}" needs closure before execution confidence improves.`,
    }, MAX_ITEMS);
    addUnique(actions, {
      title: `Close decision follow-up: ${decision.overdueCommittedDecision.title}`,
      rationale: "Operations execution is blocked when committed decisions remain unresolved.",
      urgency: "URGENT",
    }, MAX_ITEMS);
    addEvidence(evidence, {
      source: "decision",
      label: "Overdue decision",
      value: decision.overdueCommittedDecision.title,
    }, MAX_EVIDENCE);
  }

  collectForecastRisks(input, ["EXECUTION_RISK"], risks, actions, evidence);
  collectAlertRisks(input, ["EXECUTION_GAP"], risks, actions, evidence);
  collectScorecardEvidence(input, ["EXECUTION_HEALTH", "DECISION_DISCIPLINE"], risks, evidence);
  collectFailedStepEvidence(input, evidence);

  return finalizeOpinion({
    directorType: "OPERATIONS_DIRECTOR",
    opinionTitle: "Operations Director Opinion",
    fallbackSummary: "Operations opinion has limited evidence; execution ownership and stale actions should be checked.",
    signals,
    risks,
    opportunities,
    actions,
    evidence,
    generatedAt,
    hasCoreSignal: Boolean(collection || decision),
    failedSteps: input.failedSteps,
  });
}

function buildStrategyOpinion(
  input: BuildDirectorOpinionsInput,
  generatedAt: string,
): DirectorOpinion {
  const signals: DirectorOpinionSignal[] = [];
  const risks: DirectorOpinionRisk[] = [];
  const opportunities: DirectorOpinion["opportunities"] = [];
  const actions: DirectorOpinionAction[] = [];
  const evidence: DirectorOpinionEvidence[] = [];

  const awareness = input.executiveAwareness;
  if (awareness) {
    addUnique(signals, {
      title: "Company posture reading",
      detail: awareness.primaryNarrative,
      source: "awareness",
    }, MAX_ITEMS);
    addEvidence(evidence, {
      source: "awareness",
      label: "Business posture",
      value: awareness.businessPosture,
    }, MAX_EVIDENCE);
    addEvidence(evidence, {
      source: "awareness",
      label: "Overall direction",
      value: awareness.overallDirection,
    }, MAX_EVIDENCE);

    if (awareness.businessPosture === "AT_RISK" || awareness.overallDirection === "CRITICAL") {
      addUnique(risks, {
        title: "Company posture needs strategic attention",
        severity: "URGENT",
        explanation: awareness.managementImplication,
      }, MAX_ITEMS);
    }

    for (const attention of awareness.recommendedAttention.slice(0, 2)) {
      addUnique(actions, {
        title: attention,
        rationale: "Awareness engine selected this as a management attention area.",
        urgency: awareness.businessPosture === "AT_RISK" ? "URGENT" : "IMPORTANT",
      }, MAX_ITEMS);
    }
  }

  const narrative = input.executiveNarrative;
  if (narrative) {
    addEvidence(evidence, {
      source: "narrative",
      label: "Narrative posture",
      value: narrative.posture,
    }, MAX_EVIDENCE);
    if (narrative.firstAttention) {
      addUnique(actions, {
        title: narrative.firstAttention,
        rationale: "Narrative engine selected this as first management attention.",
        urgency: narrative.posture === "CRITICAL" ? "URGENT" : "IMPORTANT",
      }, MAX_ITEMS);
    }
  }

  const trend = input.signalTrendContext;
  if (trend?.hasData) {
    addEvidence(evidence, {
      source: "signal_trend",
      label: "Trend direction",
      value: trend.trendDirection,
    }, MAX_EVIDENCE);
    if (trend.trendDirection === "RISING") {
      addUnique(risks, {
        title: "Risk momentum is rising",
        severity: trend.currentRiskLevel === "CRITICAL" ? "URGENT" : "IMPORTANT",
        explanation: trend.formattedSummary ?? "Signal trend indicates rising risk momentum.",
      }, MAX_ITEMS);
    }
  }

  collectScorecardEvidence(input, ["SIGNAL_MOMENTUM", "DATA_QUALITY", "DECISION_DISCIPLINE"], risks, evidence);
  collectFailedStepEvidence(input, evidence);

  if (risks.length === 0 && input.executiveScorecard?.overallLevel === "HEALTHY") {
    addUnique(opportunities, {
      title: "Strategic posture is stable enough for proactive planning",
      impact: "MEDIUM",
      explanation: input.executiveScorecard.summary,
    }, MAX_ITEMS);
  }

  return finalizeOpinion({
    directorType: "STRATEGY_DIRECTOR",
    opinionTitle: "Strategy Director Opinion",
    fallbackSummary: "Strategy opinion has limited evidence; company posture and decision discipline should be reviewed.",
    signals,
    risks,
    opportunities,
    actions,
    evidence,
    generatedAt,
    hasCoreSignal: Boolean(awareness || input.executiveScorecard || narrative),
    failedSteps: input.failedSteps,
  });
}

function buildResearchOpinion(
  input: BuildDirectorOpinionsInput,
  generatedAt: string,
): DirectorOpinion {
  const signals: DirectorOpinionSignal[] = [];
  const risks: DirectorOpinionRisk[] = [];
  const opportunities: DirectorOpinion["opportunities"] = [];
  const actions: DirectorOpinionAction[] = [];
  const evidence: DirectorOpinionEvidence[] = [];

  const briefing = input.latestBriefing;
  if (briefing) {
    addUnique(signals, {
      title: "Market briefing reading",
      detail: `${briefing.kritikItems.length} critical and ${briefing.dikkatItems.length} watch market items are visible.`,
      source: "briefing",
    }, MAX_ITEMS);
    addEvidence(evidence, {
      source: "briefing",
      label: "Briefing source count",
      value: String(briefing.sourceCount),
    }, MAX_EVIDENCE);
    addEvidence(evidence, {
      source: "briefing",
      label: "Briefing confidence",
      value: briefing.overallConfidenceLevel,
    }, MAX_EVIDENCE);

    const negativeCritical = briefing.kritikItems.filter(
      (item) =>
        item.finansal_etki.yon === "NEGATIF" ||
        item.ekonomik_etki.yon === "NEGATIF" ||
        item.operasyonel_etki.yon === "NEGATIF" ||
        item.satis_etkisi.yon === "NEGATIF",
    );

    if (negativeCritical.length > 0) {
      const first = negativeCritical[0];
      addUnique(risks, {
        title: first.headline,
        severity: first.impact_score >= 0.8 ? "URGENT" : "IMPORTANT",
        explanation: first.summary,
      }, MAX_ITEMS);
      addUnique(actions, {
        title: first.yonetim_onerisi || `Review market item: ${first.headline}`,
        rationale: "Briefing marked this external item as critical or negative.",
        urgency: first.impact_score >= 0.8 ? "URGENT" : "IMPORTANT",
      }, MAX_ITEMS);
    } else if (briefing.totalItems > 0) {
      addUnique(opportunities, {
        title: "External briefing is available for management context",
        impact: "MEDIUM",
        explanation: "Current market briefing has source-backed items without a critical negative lead item.",
      }, MAX_ITEMS);
    }
  }

  collectForecastRisks(input, ["CURRENCY_RISK"], risks, actions, evidence);
  collectAlertRisks(input, ["CURRENCY_EXPOSURE", "MARKET_RISK", "STRATEGIC_HEALTH"], risks, actions, evidence);
  collectScorecardEvidence(input, ["MARKET_EXPOSURE"], risks, evidence);
  collectFailedStepEvidence(input, evidence);

  return finalizeOpinion({
    directorType: "RESEARCH_DIRECTOR",
    opinionTitle: "Research Director Opinion",
    fallbackSummary: "Research opinion has limited evidence; latest briefing or market context is not available.",
    signals,
    risks,
    opportunities,
    actions,
    evidence,
    generatedAt,
    hasCoreSignal: Boolean(briefing),
    failedSteps: input.failedSteps,
  });
}

function finalizeOpinion(input: {
  directorType: DirectorType;
  opinionTitle: string;
  fallbackSummary: string;
  signals: DirectorOpinionSignal[];
  risks: DirectorOpinionRisk[];
  opportunities: DirectorOpinion["opportunities"];
  actions: DirectorOpinionAction[];
  evidence: DirectorOpinionEvidence[];
  generatedAt: string;
  hasCoreSignal: boolean;
  failedSteps?: string[];
}): DirectorOpinion {
  const hasEvidence = input.evidence.length > 0;
  const evidence = hasEvidence
    ? input.evidence
    : [{
        source: "data_quality" as const,
        label: "Evidence",
        value: "Insufficient director-specific evidence was available.",
      }];
  const dataQualityNote = input.hasCoreSignal
    ? null
    : `${input.opinionTitle} has insufficient director-specific evidence.`;
  const confidence = resolveOpinionConfidence({
    evidence,
    hasCoreSignal: input.hasCoreSignal,
    failedSteps: input.failedSteps,
  });
  const urgency = resolveOpinionUrgency({
    risks: input.risks,
    actions: input.actions,
    fallback: confidence === "LOW" ? "WATCH" : "LOW",
  });

  return {
    directorType: input.directorType,
    opinionTitle: input.opinionTitle,
    executiveSummary: buildOpinionSummary({
      fallback: input.fallbackSummary,
      primarySignal: input.signals[0] ?? null,
      primaryRisk: input.risks[0] ?? null,
      primaryOpportunity: input.opportunities[0]?.explanation ?? null,
      dataQualityNote,
    }),
    signals: input.signals,
    risks: input.risks,
    opportunities: input.opportunities,
    recommendedActions: input.actions,
    confidence,
    urgency,
    evidence,
    generatedAt: input.generatedAt,
    version: VERSION,
  };
}

function collectForecastRisks(
  input: BuildDirectorOpinionsInput,
  riskTypes: string[],
  risks: DirectorOpinionRisk[],
  actions: DirectorOpinionAction[],
  evidence: DirectorOpinionEvidence[],
): void {
  for (const signal of input.executiveForecast?.signals ?? []) {
    if (!riskTypes.includes(signal.riskType)) continue;
    addEvidence(evidence, {
      source: "forecast",
      label: signal.riskType,
      value: signal.riskLevel,
    }, MAX_EVIDENCE);
    if (signal.riskLevel === "LOW") continue;

    addUnique(risks, {
      title: signal.headline,
      severity: forecastLevelToUrgency(signal.riskLevel),
      explanation: signal.explanation,
    }, MAX_ITEMS);

    if (signal.actionableStep) {
      addUnique(actions, {
        title: signal.actionableStep,
        rationale: `Forecast signal ${signal.riskType} recommends action.`,
        urgency: forecastLevelToUrgency(signal.riskLevel),
      }, MAX_ITEMS);
    }
  }
}

function collectAlertRisks(
  input: BuildDirectorOpinionsInput,
  categories: AlertCategory[],
  risks: DirectorOpinionRisk[],
  actions: DirectorOpinionAction[],
  evidence: DirectorOpinionEvidence[],
): void {
  const alerts = [
    ...(input.executiveAlerts?.criticalAlerts ?? []),
    ...(input.executiveAlerts?.highAlerts ?? []),
    ...(input.executiveAlerts?.watchAlerts ?? []),
  ];

  for (const alert of alerts) {
    if (!categories.includes(alert.category)) continue;
    addEvidence(evidence, {
      source: "alert",
      label: alert.category,
      value: alert.severity,
    }, MAX_EVIDENCE);
    addUnique(risks, {
      title: alert.headline,
      severity: alertSeverityToUrgency(alert.severity),
      explanation: alert.headline,
    }, MAX_ITEMS);

    if (alert.actionableStep) {
      addUnique(actions, {
        title: alert.actionableStep,
        rationale: `Alert category ${alert.category} recommends action.`,
        urgency: alertSeverityToUrgency(alert.severity),
      }, MAX_ITEMS);
    }
  }
}

function collectScorecardEvidence(
  input: BuildDirectorOpinionsInput,
  areas: ExecutiveScorecardArea[],
  risks: DirectorOpinionRisk[],
  evidence: DirectorOpinionEvidence[],
): void {
  for (const area of input.executiveScorecard?.areas ?? []) {
    if (!areas.includes(area.area)) continue;
    addEvidence(evidence, {
      source: "scorecard",
      label: area.area,
      value: area.level,
    }, MAX_EVIDENCE);
    if (area.level === "HEALTHY" || area.level === "UNKNOWN") continue;
    addUnique(risks, {
      title: area.headline,
      severity: scorecardLevelToUrgency(area),
      explanation: area.drivers[0] ?? area.headline,
    }, MAX_ITEMS);
  }
}

function collectFailedStepEvidence(
  input: BuildDirectorOpinionsInput,
  evidence: DirectorOpinionEvidence[],
): void {
  const failedSteps = input.failedSteps ?? [];
  if (failedSteps.length === 0) return;
  addEvidence(evidence, {
    source: "data_quality",
    label: "Failed steps",
    value: failedSteps.slice(0, 4).join(", "),
  }, MAX_EVIDENCE);
}

function forecastLevelToUrgency(level: string): DirectorOpinionUrgency {
  if (level === "CRITICAL") return "URGENT";
  if (level === "HIGH") return "IMPORTANT";
  if (level === "WATCH") return "WATCH";
  return "LOW";
}

function alertSeverityToUrgency(severity: string): DirectorOpinionUrgency {
  if (severity === "CRITICAL") return "URGENT";
  if (severity === "HIGH") return "IMPORTANT";
  return "WATCH";
}

function scorecardLevelToUrgency(
  area: ExecutiveScorecardAreaResult,
): DirectorOpinionUrgency {
  return scorecardLevelValueToUrgency(area.level);
}

function scorecardLevelValueToUrgency(
  level: ExecutiveScorecardLevel,
): DirectorOpinionUrgency {
  if (level === "AT_RISK") return "URGENT";
  if (level === "PRESSURED") return "IMPORTANT";
  if (level === "WATCH") return "WATCH";
  return "LOW";
}
