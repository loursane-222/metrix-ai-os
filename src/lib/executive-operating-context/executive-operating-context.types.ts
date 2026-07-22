import type { ExecutiveSignalSnapshot, ExecutiveAction } from "@prisma/client";
import type { OrganizationRole } from "@prisma/client";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteConversionContext } from "@/lib/core/quotes/quote-conversion-context-builder";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { LatestBriefingResult } from "@/lib/daily-briefing/daily-briefing-storage.service";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveAlert, ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop/executive-decision-loop.types";
import type { ExecutiveDecisionFollowUpResult } from "@/lib/executive-decision-follow-up";
import type { ExecutiveAccountabilityResult } from "@/lib/executive-accountability";
import type { ExecutiveRhythm, DailyPriority } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";
import type {
  ExecutiveConversationState,
  ExecutiveRecommendationPackage,
} from "@/lib/ai/executive-conversation.types";
import type { ExecutiveBrainShadowMetadata } from "@/lib/executive-brain/executive-brain.types";
import type { ExecutiveAwareness } from "@/lib/executive-awareness";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { ExecutiveNarrative } from "@/lib/executive-narrative";
import type { ExecutiveFocus } from "@/lib/executive-focus";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { CustomerPortfolioIntelligence } from "@/lib/customer-portfolio-intelligence";
import type { CustomerHealthIntelligence } from "@/lib/customer-health-intelligence";
import type { ExpenseContext, ExpenseIntelligence } from "@/lib/core/expenses";
import type { FinancialHealthIntelligence } from "@/lib/financial-health-intelligence";
import type { CompanyPerformanceSignal } from "@/lib/company-performance-signal";
import type { ExecutivePrioritizationResult } from "@/lib/executive-prioritization";
import type { ExecutiveOperatingRhythm } from "@/lib/executive-operating-rhythm";
import type { ExecutiveFollowUpReport } from "@/lib/executive-follow-up-intelligence";

export type ExecutiveOperatingContextMode =
  | "CHAT"
  | "BRIEFING"
  | "DASHBOARD"
  | "VOICE";

export type ExecutiveOperatingContextWritePolicy = {
  syncCollectionActions: boolean;
  writeSignalSnapshot: boolean;
  writeDecisionRecords: boolean;
  syncPriorityActions: boolean;
};

export type ExecutiveOperatingPersonContextItem = {
  type: string;
  fullName: string;
  title: string | null;
  notes: string | null;
};

export type BuildExecutiveOperatingContextInput = {
  organizationId: string;
  mode: ExecutiveOperatingContextMode;
  conversationId?: string | null;
  conversationState?: ExecutiveConversationState | null;
  executiveBrainContext?: ExecutiveBrainShadowMetadata | null;
  recommendationPackage?: ExecutiveRecommendationPackage | null;
  resolveRuntimeAugmentation?: (
    input: ExecutiveOperatingRuntimeAugmentationInput,
  ) => ExecutiveOperatingRuntimeAugmentation;
  writePolicy?: Partial<ExecutiveOperatingContextWritePolicy>;
  // When true, the writePolicy-gated side-effect blocks (collection action
  // sync, signal snapshot, decision records, priority action sync) are not
  // awaited inline — they are bundled into the returned
  // runDeferredOperatingContextWrites callback instead, so the caller can
  // run them after the response has already been sent. Defaults to false
  // (current behavior: writes run inline, exactly as before) for every
  // existing caller that doesn't pass this.
  deferWrites?: boolean;
  strictSteps?: string[];
  now?: Date;
  currentUserId?: string | null;
  currentUserName?: string | null;
  organizationMembershipRole?: OrganizationRole | null;
  onStepTiming?: (timing: {
    step: string;
    elapsedMs: number;
    success: boolean;
    required: boolean;
    deferred: boolean;
  }) => void;
};

export type ExecutiveOperatingRuntimeAugmentationInput = {
  quoteIntelligence: QuoteIntelligence | null;
  quoteConversionContext: QuoteConversionContext | null;
};

export type ExecutiveOperatingRuntimeAugmentation = {
  recommendationPackage?: ExecutiveRecommendationPackage | null;
  conversationState?: ExecutiveConversationState | null;
};

export type ExecutiveOperatingContextDiagnostics = {
  failedSteps: string[];
  writeActions: string[];
  onStepTiming?: BuildExecutiveOperatingContextInput["onStepTiming"];
};

export type ExecutiveOperatingSignalContext = {
  dailyAnchorSnapshot: ExecutiveSignalSnapshot | null;
  sourceSignalSnapshot: ExecutiveSignalSnapshot | null;
  recentSnapshots: ExecutiveSignalSnapshot[];
  trendContext: SignalTrendContext | null;
};

export type ExecutiveOperatingContext = {
  organizationId: string;
  mode: ExecutiveOperatingContextMode;
  generatedAt: string;
  today: string;

  memoryContext: MemoryContext | null;
  personContext: ExecutiveOperatingPersonContextItem[];

  quoteContext: QuoteContext | null;
  quoteConversionContext: QuoteConversionContext | null;
  quoteIntelligence: QuoteIntelligence | null;

  paymentContext: PaymentContext | null;
  paymentIntelligence: PaymentIntelligence | null;

  collectionActionContext: CollectionActionContext | null;
  latestBriefing: LatestBriefingResult;

  executiveForecast: ExecutiveForecast | null;
  executiveAlerts: ExecutiveAlertBundle | null;
  executiveDecisionContext: ExecutiveDecisionContext | null;
  executiveDecisionFollowUp: ExecutiveDecisionFollowUpResult | null;
  executiveAccountability: ExecutiveAccountabilityResult | null;
  executiveRhythm: ExecutiveRhythm | null;
  executiveAwareness: ExecutiveAwareness | null;
  executiveScorecard: ExecutiveScorecard | null;
  executiveNarrative: ExecutiveNarrative | null;
  executiveFocus: ExecutiveFocus | null;
  goalIntelligence: ExecutiveGoalIntelligence | null;
  customerPortfolioIntelligence: CustomerPortfolioIntelligence | null;
  customerHealthIntelligence: CustomerHealthIntelligence | null;

  expenseContext: ExpenseContext | null;
  expenseIntelligence: ExpenseIntelligence | null;
  financialHealthIntelligence: FinancialHealthIntelligence | null;
  companyPerformanceSignal: CompanyPerformanceSignal | null;
  executivePriority: ExecutivePrioritizationResult | null;
  executiveOperatingRhythm: ExecutiveOperatingRhythm | null;
  executiveFollowUpIntelligence: ExecutiveFollowUpReport | null;
  recentCompletedExecutiveActions: ExecutiveAction[] | null;

  signal: ExecutiveOperatingSignalContext;
  diagnostics: ExecutiveOperatingContextDiagnostics;

  // Runs whichever of the 4 write-policy side-effect blocks were deferred
  // (see deferWrites on the input). No-op when deferWrites was not set,
  // since those blocks already ran inline before this object was returned.
  runDeferredOperatingContextWrites: () => Promise<void>;
};

export type ExecutiveOperatingContextSummary = {
  riskLevel: ExecutiveForecast["overallRiskLevel"] | null;
  topPriorities: DailyPriority[];
  criticalAlerts: ExecutiveAlert[];
  openDecisionCount: number;
  hasOverdueDecision: boolean;
  signalTrendText: string | null;
  forecastSummary: string | null;
  dataQualityNote: string | null;
};
