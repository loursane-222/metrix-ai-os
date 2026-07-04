import type { ExecutiveAwareness } from "@/lib/executive-awareness/executive-awareness.types";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard/executive-scorecard.types";
import type { ExecutiveNarrative } from "@/lib/executive-narrative/executive-narrative.types";
import type { ExecutiveFocus } from "@/lib/executive-focus/executive-focus.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop/executive-decision-loop.types";
import type { ExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { ExecutiveOperatingRhythm } from "@/lib/executive-operating-rhythm";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { ExecutiveDecisionPromptSummary } from "@/lib/executive-decision-engine";
import type { ExecutiveDecisionFollowUpPromptSummary } from "@/lib/executive-decision-follow-up";
import type { ExecutiveAccountabilityPromptSummary } from "@/lib/executive-accountability";
import type { ExecutiveDelegationPromptSummary } from "@/lib/executive-delegation";
import type { ExecutiveResponsibilityMatrixPromptSummary } from "@/lib/executive-responsibility-matrix";
import type { ExecutivePerformanceSignalPromptSummary } from "@/lib/executive-performance-signal";
import type { ExecutiveManagementReviewPromptSummary } from "@/lib/executive-management-review";
import type { CustomerPortfolioPromptSummary } from "@/lib/customer-portfolio-intelligence";
import type { CustomerHealthPromptSummary } from "@/lib/customer-health-intelligence";
import type { ExpenseContext, ExpenseIntelligence } from "@/lib/core/expenses";
import {
  buildFinancialHealthPromptSummary,
  type FinancialHealthIntelligence,
} from "@/lib/financial-health-intelligence";
import {
  buildCompanyPerformanceSignalPromptSummary,
  type CompanyPerformanceSignal,
} from "@/lib/company-performance-signal";
import type { ExecutivePrioritizationResult } from "@/lib/executive-prioritization";
import type { ExecutiveFollowUpPromptSummary } from "@/lib/executive-follow-up-intelligence";
import { buildDirectorOpinions } from "@/lib/director-opinions/director-opinion-engine.service";
import { buildExecutiveCouncilSynthesis } from "@/lib/executive-council/executive-council-engine.service";
import type {
  ExecutiveManagerContext,
  ExecutiveManagerContextConfidence,
  GoalAchievementSnapshot,
} from "./executive-prompt-bridge.types";

export type BuildExecutivePromptBridgeInput = {
  organizationId: string;
  executiveAwareness: ExecutiveAwareness | null;
  executiveScorecard: ExecutiveScorecard | null;
  executiveNarrative: ExecutiveNarrative | null;
  executiveFocus: ExecutiveFocus | null;
  executiveForecast: ExecutiveForecast | null;
  executiveAlerts: ExecutiveAlertBundle | null;
  executiveDecisionContext: ExecutiveDecisionContext | null;
  executiveRhythm: ExecutiveRhythm | null;
  paymentContext: PaymentContext | null;
  paymentIntelligence: PaymentIntelligence | null;
  quoteContext: QuoteContext | null;
  quoteIntelligence: QuoteIntelligence | null;
  collectionActionContext: CollectionActionContext | null;
  latestBriefing: BriefingPackage | null;
  signalTrendContext: SignalTrendContext | null;
  failedSteps: string[];
  goalIntelligence?: ExecutiveGoalIntelligence | null;
  executiveDecision?: ExecutiveDecisionPromptSummary | null;
  executiveDecisionFollowUp?: ExecutiveDecisionFollowUpPromptSummary | null;
  executiveAccountability?: ExecutiveAccountabilityPromptSummary | null;
  executiveDelegation?: ExecutiveDelegationPromptSummary | null;
  executiveResponsibilityMatrix?: ExecutiveResponsibilityMatrixPromptSummary | null;
  executivePerformanceSignal?: ExecutivePerformanceSignalPromptSummary | null;
  executiveManagementReview?: ExecutiveManagementReviewPromptSummary | null;
  customerPortfolio?: CustomerPortfolioPromptSummary | null;
  customerHealth?: CustomerHealthPromptSummary | null;
  expenseContext?: ExpenseContext | null;
  expenseIntelligence?: ExpenseIntelligence | null;
  financialHealthIntelligence?: FinancialHealthIntelligence | null;
  companyPerformanceSignal?: CompanyPerformanceSignal | null;
  executivePriority?: ExecutivePrioritizationResult | null;
  executiveOperatingRhythm?: ExecutiveOperatingRhythm | null;
  executiveFollowUpIntelligence?: ExecutiveFollowUpPromptSummary | null;
};

export function buildExecutivePromptBridge(
  input: BuildExecutivePromptBridgeInput,
): ExecutiveManagerContext | null {
  const { executiveNarrative: narrative, executiveFocus: focus } = input;
  if (!narrative || !focus) return null;

  const { awareness, scorecard } = {
    awareness: input.executiveAwareness,
    scorecard: input.executiveScorecard,
  };

  const contextConfidence = resolveContextConfidence(awareness, scorecard, focus);
  const dataQualityNote = contextConfidence === "LOW"
    ? (awareness?.dataQualityNote ?? scorecard?.dataQualityNote ?? null)
    : null;

  const councilFields = buildCouncilFields(input, contextConfidence);
  const goalSummary = input.goalIntelligence?.promptLine ?? null;
  const goalAchievement = extractGoalAchievement(input.executiveForecast);
  const financialHealth = input.financialHealthIntelligence
    ? buildFinancialHealthPromptSummary(input.financialHealthIntelligence)
    : null;
  const companyPerformance = input.companyPerformanceSignal
    ? buildCompanyPerformanceSignalPromptSummary(input.companyPerformanceSignal)
    : null;

  return {
    posture: narrative.posture,
    direction: awareness?.overallDirection ?? "UNKNOWN",
    health: scorecard?.overallLevel ?? "UNKNOWN",
    tone: narrative.tone,
    situationalRead: narrative.promptNarrative,
    primaryFocusArea: focus.primaryFocus.focusArea,
    primaryFocusLevel: focus.primaryFocus.focusLevel,
    primaryFirstMove: focus.primaryFocus.firstMove,
    secondaryFocusArea: focus.secondaryFocus?.focusArea ?? null,
    focusInstruction: focus.managementInstruction,
    firstAttention: narrative.firstAttention,
    weakestArea: scorecard?.weakestArea ?? null,
    watchAreas: awareness?.watchAreas ?? [],
    contextConfidence,
    dataQualityNote,
    goalSummary,
    executiveDecision: input.executiveDecision ?? null,
    executiveDecisionFollowUp: input.executiveDecisionFollowUp ?? null,
    executiveAccountability: input.executiveAccountability ?? null,
    executiveDelegation: input.executiveDelegation ?? null,
    executiveResponsibilityMatrix: input.executiveResponsibilityMatrix ?? null,
    executivePerformanceSignal: input.executivePerformanceSignal ?? null,
    executiveManagementReview: input.executiveManagementReview ?? null,
    customerPortfolio: input.customerPortfolio ?? null,
    customerHealth: input.customerHealth ?? null,
    expenseContext: input.expenseContext ?? null,
    expenseIntelligence: input.expenseIntelligence ?? null,
    financialHealth,
    companyPerformance,
    goalAchievement,
    executivePriority: input.executivePriority ?? null,
    executiveOperatingRhythm: input.executiveOperatingRhythm ?? null,
    executiveFollowUpIntelligence: input.executiveFollowUpIntelligence ?? null,
    ...councilFields,
  };
}

function extractGoalAchievement(
  forecast: ExecutiveForecast | null | undefined,
): GoalAchievementSnapshot {
  const proj = forecast?.projection;
  return {
    monthlyTarget: proj?.monthlyTarget ?? null,
    forecastedMonthEndRevenue: proj?.forecastedMonthEndRevenue ?? null,
    goalAchievementRate: proj?.goalAchievementRate ?? null,
    goalGap: proj?.goalGap ?? null,
  };
}

function buildCouncilFields(
  input: BuildExecutivePromptBridgeInput,
  contextConfidence: ExecutiveManagerContextConfidence,
): Pick<ExecutiveManagerContext, "councilPosition" | "councilStanceRationale" | "topCouncilAction" | "topConcern"> {
  try {
    const bundle = buildDirectorOpinions({
      organizationId: input.organizationId,
      paymentContext: input.paymentContext,
      paymentIntelligence: input.paymentIntelligence,
      quoteContext: input.quoteContext,
      quoteIntelligence: input.quoteIntelligence,
      collectionActionContext: input.collectionActionContext,
      latestBriefing: input.latestBriefing,
      executiveForecast: input.executiveForecast,
      executiveAlerts: input.executiveAlerts,
      executiveDecisionContext: input.executiveDecisionContext,
      executiveRhythm: input.executiveRhythm,
      executiveAwareness: input.executiveAwareness,
      executiveScorecard: input.executiveScorecard,
      executiveNarrative: input.executiveNarrative,
      signalTrendContext: input.signalTrendContext,
      failedSteps: input.failedSteps,
    });

    const synthesis = buildExecutiveCouncilSynthesis({
      organizationId: input.organizationId,
      directorOpinionBundle: bundle,
    });

    const isLow = synthesis.confidence === "LOW" || contextConfidence === "LOW";

    return {
      councilPosition: synthesis.councilPosition,
      councilStanceRationale: isLow ? null : (synthesis.recommendedExecutiveStance.rationale ?? null),
      topCouncilAction: isLow ? null : (synthesis.recommendedActions[0]?.title ?? null),
      topConcern: bundle.topConcerns[0] ?? null,
    };
  } catch {
    return {
      councilPosition: null,
      councilStanceRationale: null,
      topCouncilAction: null,
      topConcern: null,
    };
  }
}

function resolveContextConfidence(
  awareness: ExecutiveAwareness | null,
  scorecard: ExecutiveScorecard | null,
  focus: ExecutiveFocus,
): ExecutiveManagerContextConfidence {
  const values: ExecutiveManagerContextConfidence[] = [focus.confidence];
  if (awareness?.confidence) values.push(awareness.confidence);
  if (scorecard?.confidence) values.push(scorecard.confidence);

  if (values.includes("LOW")) return "LOW";
  if (values.includes("MEDIUM")) return "MEDIUM";
  return "HIGH";
}
