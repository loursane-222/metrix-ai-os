import type {
  ForecastConfidence,
  ForecastRiskLevel,
} from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveActionOutcomeSummary } from "@/lib/core/executive-actions/executive-action-outcome-summary.service";

export type ExecutiveDailyBriefingV2Priority = {
  rank: 1 | 2 | 3;
  title: string;
  focus: string;
  actionHint: string | null;
  urgency: string;
  source: string;
};

export type ExecutiveDailyBriefingV2Alert = {
  title: string;
  severity: string;
  actionHint: string | null;
  source: string;
};

export type ExecutiveDailyBriefingV2WatchSignal = {
  title: string;
  reason: string;
  actionHint: string | null;
  source: string;
};

export type ExecutiveDailyBriefingV2MarketItem = {
  headline: string;
  summary: string;
  actionHint: string | null;
  source: string;
};

export type ExecutiveDailyBriefingV2FirstAction = {
  title: string;
  reason: string;
  actionHint: string | null;
  source: string;
};

export type ExecutiveDailyBriefingV2DecisionFollowUps = {
  openDecisions: ExecutiveDailyBriefingV2DecisionItem[];
  overdueCommittedDecision: ExecutiveDailyBriefingV2DecisionItem | null;
  latestOutcome: ExecutiveDailyBriefingV2DecisionOutcome | null;
};

export type ExecutiveDailyBriefingV2DecisionItem = {
  title: string;
  reason: string;
  actionHint: string | null;
  dueAt: string | null;
  priority: string | null;
};

export type ExecutiveDailyBriefingV2DecisionOutcome = {
  decisionTitle: string;
  outcome: string;
  summary: string | null;
  occurredAt: string;
};

export type ExecutiveDailyBriefingV2MarketBriefing = {
  criticalItems: ExecutiveDailyBriefingV2MarketItem[];
  watchItems: ExecutiveDailyBriefingV2MarketItem[];
  sourceCount: number;
};

export type ExecutiveDailyBriefingV2 = {
  organizationId: string;
  briefingDate: string;
  generatedAt: string;
  timezone: string;
  headline: string;
  overallRiskLevel: ForecastRiskLevel | null;
  overallConfidence: ForecastConfidence | null;
  dataQualityNote: string;
  topPriorities: ExecutiveDailyBriefingV2Priority[];
  criticalAlerts: ExecutiveDailyBriefingV2Alert[];
  watchSignals: ExecutiveDailyBriefingV2WatchSignal[];
  awarenessSummary: string;
  scorecardSummary: string;
  executiveNarrativeSummary: string;
  executiveFocusSummary: string;
  forecastSummary: string;
  decisionFollowUps: ExecutiveDailyBriefingV2DecisionFollowUps;
  signalTrendSummary: string;
  marketBriefing: ExecutiveDailyBriefingV2MarketBriefing;
  firstAction: ExecutiveDailyBriefingV2FirstAction;
  actionOutcomeSummary: ExecutiveActionOutcomeSummary | null;
};
